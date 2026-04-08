/**
 * Улучшенная функция разбиения текста для юридических документов.
 * 
 * Особенности:
 * 1. Приоритетно разбивает по номерам пунктов (1., 2., 22., etc.)
 * 2. Сохраняет контекст - включает заголовок/номер раздела в каждый чанк
 * 3. Для длинных пунктов использует sub-пункты (а), б), etc.)
 * 4. Сохраняет структуру документа для точного цитирования
 * 5. Возвращает метаданные о номере пункта и заголовке раздела
 */
export interface ChunkOptions {
  chunkSize?: number;      // Макс. размер чанка (по умолчанию 1200)
  overlap?: number;        // Перекрытие между чанками (по умолчанию 250)
  preserveStructure?: boolean; // Сохранять структуру пунктов (по умолчанию true)
}

export interface TextChunkWithMeta {
  text: string;
  pointNumber?: string;    // Номер пункта (например, "2", "22.1")
  sectionTitle?: string;   // Заголовок раздела (например, "I. Общие положения")
  hasNumberedPoints: boolean;
  subPoints?: string[];    // Список подпунктов, принадлежащих этому пункту
  isCompletePoint?: boolean; // Является ли чанк полным пунктом
}

export interface TextChunk {
  text: string;
  sectionRef?: string;     // Ссылка на раздел (напр. "п.22")
  hasNumberedPoints: boolean;
}

// Порядок подпунктов в русском алфавите
const SUBPOINT_ORDER = 'абвгдежзийклмнопрстуфхцчшщъыьэюя';

// Паттерны для номеров пунктов в юридических документах
const POINT_PATTERNS = [
  /^(\d{1,3})\.\s/,           // "22. Текст пункта"
  /^(\d{1,3})\)\s/,           // "22) Текст пункта"
  /^\((\d{1,3})\)\s/,         // "(22) Текст пункта"
  /^(\d{1,3})\s+\.\s/,        // "22 . Текст"
  /^статья\s+(\d+)\s/i,       // "Статья 22"
  /^§\s*(\d+)\s/i,            // "§ 22"
];

// Паттерны для подпунктов: а), б), в), etc.
const SUBPOINT_PATTERNS = [
  /^([а-яёa-z])\)\s/,           // "а) текст"
  /^\(([а-яёa-z])\)\s/,         // "(а) текст"
  /^\d+\.\d+\s/,                 // "1.1 текст"
];

// Паттерны для заголовков разделов
const SECTION_PATTERNS = [
  /^([IVXLCDM]+)\.\s.+$/,       // "I. Общие положения"
  /^[А-ЯЁ][А-ЯЁ\s]{3,}:?$/,     // "ОБЩИЕ ПОЛОЖЕНИЯ"
  /^Глава\s+[IVXLCDM]+\./i,     // "Глава I."
];

function isPointStart(line: string): boolean {
  const trimmed = line.trim();
  for (const pattern of POINT_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

function extractPointNumber(line: string): string | null {
  const trimmed = line.trim();
  for (const pattern of POINT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function isSubPointStart(line: string): { isSubPoint: boolean; letter: string | null } {
  const trimmed = line.trim();
  for (const pattern of SUBPOINT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { isSubPoint: true, letter: match[1] || null };
    }
  }
  return { isSubPoint: false, letter: null };
}

function isSectionStart(line: string): boolean {
  const trimmed = line.trim();
  for (const pattern of SECTION_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

function extractSectionTitle(line: string): string | null {
  const trimmed = line.trim();
  // Для римских цифр
  const romanMatch = trimmed.match(/^([IVXLCDM]+)\.\s+(.+)$/);
  if (romanMatch) return `${romanMatch[1]}. ${romanMatch[2]}`;
  
  // Для заголовков типа "ОБЩИЕ ПОЛОЖЕНИЯ"
  const titleMatch = trimmed.match(/^([А-ЯЁ][А-ЯЁ\s]{3,}):?$/);
  if (titleMatch) return titleMatch[1];
  
  // Для "Глава I."
  const chapterMatch = trimmed.match(/^(Глава\s+[IVXLCDM]+\..+)$/i);
  if (chapterMatch) return chapterMatch[1];
  
  return null;
}

export function chunkTextWithMetadata(text: string, opts?: ChunkOptions): TextChunkWithMeta[] {
  const chunkSize = opts?.chunkSize ?? 1200;

  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[ \xA0]+/g, " ")  // Нормализуем неразрывные пробелы
    .trim();
  
  if (!normalized) return [];

  // Разбиваем на строки
  const lines = normalized.split("\n");
  
  // Сначала разбиваем документ на отдельные пункты (с учётом текущего заголовка раздела)
  const points: Array<{
    pointNumber: string;
    content: string;
    startLine: number;
    endLine: number;
    sectionTitle: string | null;
  }> = [];
  let currentPointNumber: string | null = null;
  let currentPointContent: string[] = [];
  let currentPointStartLine = 0;
  let currentSectionTitle: string | null = null;
  let pointSectionTitle: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const pointNum = extractPointNumber(line);
    const isPoint = isPointStart(line);

    // Строка-заголовок раздела (не начало нумерованного пункта)
    if (!isPoint && isSectionStart(line)) {
      const title = extractSectionTitle(line);
      if (title) currentSectionTitle = title;
      continue;
    }

    if (isPoint && pointNum) {
      // Сохраняем предыдущий пункт
      if (currentPointNumber && currentPointContent.length > 0) {
        points.push({
          pointNumber: currentPointNumber,
          content: currentPointContent.join("\n"),
          startLine: currentPointStartLine,
          endLine: i - 1,
          sectionTitle: pointSectionTitle,
        });
      }
      // Начинаем новый пункт — фиксируем раздел, действующий на момент начала пункта
      currentPointNumber = pointNum;
      pointSectionTitle = currentSectionTitle;
      currentPointContent = [line];
      currentPointStartLine = i;
    } else if (currentPointNumber) {
      // Это продолжение текущего пункта (включая подпункты)
      currentPointContent.push(line);
    }
  }

  // Добавляем последний пункт
  if (currentPointNumber && currentPointContent.length > 0) {
    points.push({
      pointNumber: currentPointNumber,
      content: currentPointContent.join("\n"),
      startLine: currentPointStartLine,
      endLine: lines.length - 1,
      sectionTitle: pointSectionTitle,
    });
  }
  
  // Если не нашли нумерованных пунктов - используем fallback
  if (points.length === 0) {
    return chunkTextFallbackWithMetadata(normalized, chunkSize, 250);
  }
  
  // Собираем чанки - каждый пункт может быть отдельным чанком или несколько маленьких пунктов вместе
  const result: TextChunkWithMeta[] = [];
  let currentChunkPoints: typeof points = [];
  let currentChunkSize = 0;
  
  for (const point of points) {
    const pointSize = point.content.length;
    
    // Если пункт очень большой - разбиваем его на подпункты
    if (pointSize > chunkSize) {
      // Сначала сохраняем текущий накопительный чанк если есть
      if (currentChunkPoints.length > 0) {
        result.push(createChunkFromPoints(currentChunkPoints));
        currentChunkPoints = [];
        currentChunkSize = 0;
      }
      
      // Разбиваем большой пункт на подпункты
      const subPointChunks = splitPointIntoSubPoints(point);
      result.push(...subPointChunks);
    } 
    else if (currentChunkSize + pointSize > chunkSize && currentChunkPoints.length > 0) {
      // Текущий чанк переполнен - сохраняем его и начинаем новый
      result.push(createChunkFromPoints(currentChunkPoints));
      currentChunkPoints = [point];
      currentChunkSize = pointSize;
    } 
    else {
      // Добавляем пункт в текущий чанк
      currentChunkPoints.push(point);
      currentChunkSize += pointSize;
    }
  }
  
  // Сохраняем последний чанк
  if (currentChunkPoints.length > 0) {
    result.push(createChunkFromPoints(currentChunkPoints));
  }
  
  return result.filter((c) => c.text.trim().length > 0);
}

function createChunkFromPoints(
  points: Array<{ pointNumber: string; content: string; sectionTitle?: string | null }>
): TextChunkWithMeta {
  const texts = points.map(p => p.content);
  const pointNumbers = points.map(p => p.pointNumber);
  const sectionTitle =
    points.map((p) => p.sectionTitle).find((s) => s && s.trim().length > 0) ?? undefined;

  // Извлекаем подпункты из содержимого
  const subPoints: string[] = [];
  for (const point of points) {
    const subPointMatches = point.content.matchAll(/^([а-яё])\)\s+(.+)$/gm);
    for (const match of subPointMatches) {
      subPoints.push(`${match[1]}) ${match[2]}`);
    }
  }

  return {
    text: texts.join("\n\n"),
    pointNumber: pointNumbers.join(", "),
    sectionTitle: sectionTitle ?? undefined,
    hasNumberedPoints: true,
    subPoints: subPoints.length > 0 ? subPoints : undefined,
    isCompletePoint: points.length === 1, // Один пункт = полный пункт
  };
}

/**
 * Разбивает большой пункт на подпункты
 * ВАЖНО: правильно определяет границы подпунктов и не путает их с соседними пунктами
 */
function splitPointIntoSubPoints(point: {
  pointNumber: string;
  content: string;
  sectionTitle?: string | null;
}): TextChunkWithMeta[] {
  const lines = point.content.split('\n');
  const result: TextChunkWithMeta[] = [];
  
  // Извлекаем заголовок пункта (первая строка с номером пункта)
  let headerLine = lines[0] || '';
  const headerMatch = headerLine.match(/^(\d+(?:\.\d+)*)[\.\)]\s+(.+)$/);
  const pointHeader = headerMatch ? `${headerMatch[1]}. ${headerMatch[2]}` : headerLine;
  
  // Находим все строки, которые являются подпунктами
  const subPointsMap = new Map<string, string[]>(); // letter -> content lines
  
  let currentLetter: string | null = null;
  let currentContent: string[] = [];
  
  // Начинаем с первой строки после заголовка
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const { isSubPoint, letter } = isSubPointStart(line);
    
    if (isSubPoint && letter) {
      // Сохраняем предыдущий подпункт
      if (currentLetter && currentContent.length > 0) {
        const existing = subPointsMap.get(currentLetter) || [];
        subPointsMap.set(currentLetter, [...existing, ...currentContent]);
      }
      // Начинаем новый подпункт
      currentLetter = letter;
      currentContent = [];
      // Извлекаем текст подпункта без буквы
      const subPointMatch = trimmed.match(/^[а-яё]\)\s+(.+)$/);
      if (subPointMatch) {
        currentContent.push(subPointMatch[1]);
      } else {
        currentContent.push(trimmed);
      }
    } else if (currentLetter) {
      // Продолжение текущего подпункта
      currentContent.push(trimmed);
    }
  }
  
  // Сохраняем последний подпункт
  if (currentLetter && currentContent.length > 0) {
    const existing = subPointsMap.get(currentLetter) || [];
    subPointsMap.set(currentLetter, [...existing, ...currentContent]);
  }
  
  // Если нашли подпункты - создаём чанки
  if (subPointsMap.size > 0) {
    // Сортируем подпункты по алфавиту
    const sortedLetters = Array.from(subPointsMap.keys()).sort((a, b) => {
      return SUBPOINT_ORDER.indexOf(a) - SUBPOINT_ORDER.indexOf(b);
    });
    
    for (const letter of sortedLetters) {
      const content = subPointsMap.get(letter) || [];
      const subPointText = `${letter}) ${content.join(' ')}`;
      result.push({
        text: `${pointHeader}\n${subPointText}`,
        pointNumber: point.pointNumber,
        sectionTitle: point.sectionTitle ?? undefined,
        hasNumberedPoints: true,
        subPoints: [subPointText],
        isCompletePoint: false,
      });
    }
  }
  
  // Если не нашли подпунктов, возвращаем весь пункт целиком
  if (result.length === 0) {
    return [
      {
        text: point.content,
        pointNumber: point.pointNumber,
        sectionTitle: point.sectionTitle ?? undefined,
        hasNumberedPoints: true,
        isCompletePoint: true,
      },
    ];
  }
  
  return result;
}

function chunkTextFallbackWithMetadata(text: string, chunkSize: number, overlap: number): TextChunkWithMeta[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\s+\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const chunks: TextChunkWithMeta[] = [];
  let current = "";

  for (const para of paragraphs) {
    const next = current ? `${current}\n\n${para}` : para;
    if (next.length <= chunkSize) {
      current = next;
      continue;
    }

    const ready = current.trim();
    if (ready.length > 0) {
      chunks.push({
        text: ready,
        hasNumberedPoints: false,
      });
    }

    if (para.length > chunkSize) {
      let start = 0;
      while (start < para.length) {
        const end = Math.min(start + chunkSize, para.length);
        const piece = para.slice(start, end).trim();
        if (piece) {
          chunks.push({
            text: piece,
            hasNumberedPoints: false,
          });
        }
        if (end === para.length) break;
        start = Math.max(0, end - overlap);
      }
      current = "";
    } else {
      current = para;
    }
  }

  const last = current.trim();
  if (last.length > 0) {
    chunks.push({
      text: last,
      hasNumberedPoints: false,
    });
  }

  return chunks;
}

export function chunkText(text: string, opts?: ChunkOptions): string[] {
  const chunks = chunkTextWithMetadata(text, opts);
  return chunks.map(c => c.text);
}

/**
 * Улучшенный поиск чанков по запросу с учетом номеров пунктов
 * Используется для точного цитирования конкретных пунктов документа
 */
export interface SearchResult {
  chunk: string;
  score: number;
  matchedPoint?: string;
  hasExactPointMatch: boolean;
}

export function searchChunksByPoint(
  chunks: string[],
  query: string,
  options?: { exactOnly?: boolean }
): SearchResult[] {
  const exactOnly = options?.exactOnly ?? false;
  
  // Извлекаем номер пункта из запроса
  const pointMatch = query.match(/(?:пункт|п\.?\.?\s*|статья\s*|§\s*)?(\d{1,3})/i);
  const pointNumber = pointMatch ? pointMatch[1] : null;
  
  if (!pointNumber) {
    // Если номер не найден, ищем по ключевым словам
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    return chunks.map(chunk => {
      const lowerChunk = chunk.toLowerCase();
      const keywordMatches = keywords.filter(kw => lowerChunk.includes(kw)).length;
      const score = keywords.length > 0 ? keywordMatches / keywords.length : 0.5;
      return { chunk, score, hasExactPointMatch: false };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
  }

  const results: SearchResult[] = [];

  for (const chunk of chunks) {
    const lowerChunk = chunk.toLowerCase();
    let hasExactMatch = false;
    let matchedPoint: string | undefined;

    // Проверяем точное совпадение номера пункта
    const exactPatterns = [
      new RegExp(`пункт\\s+${pointNumber}[\\s\\.\\),]`, 'i'),
      new RegExp(`п\\.\\s*${pointNumber}[\\s\\.\\),]`, 'i'),
      new RegExp(`^${pointNumber}\\.\\s`, 'm'),
      new RegExp(`^${pointNumber}\\)`, 'm'),
      new RegExp(`\\(${pointNumber}\\)`),
      new RegExp(`статья\\s+${pointNumber}[\\s\\.\\),]`, 'i'),
    ];

    for (const pattern of exactPatterns) {
      if (pattern.test(chunk)) {
        hasExactMatch = true;
        matchedPoint = `п. ${pointNumber}`;
        break;
      }
    }

    // Если ищем только точные совпадения, пропускаем остальные
    if (exactOnly && !hasExactMatch) continue;

    // Считаем score
    let score = hasExactMatch ? 1.0 : 0;
    
    // Бонус за близость к началу чанка
    const pointIndex = lowerChunk.indexOf(pointNumber);
    if (pointIndex >= 0 && pointIndex < 100) {
      score += 0.2;
    }

    // Бонус за наличие ключевых слов из запроса
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    for (const word of queryWords) {
      if (lowerChunk.includes(word)) score += 0.05;
    }

    if (score > 0) {
      results.push({ chunk, score, matchedPoint, hasExactPointMatch: hasExactMatch });
    }
  }

  // Сортируем: точные совпадения первые, затем по score
  return results.sort((a, b) => {
    if (a.hasExactPointMatch && !b.hasExactPointMatch) return -1;
    if (!a.hasExactPointMatch && b.hasExactPointMatch) return 1;
    return b.score - a.score;
  });
}