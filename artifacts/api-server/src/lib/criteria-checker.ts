// Модуль проверки соответствия критериям учёного звания

interface ApplicantData {
  rankType: "docent" | "professor";
  academicExperienceYears: number;
  pedagogicalExperienceYears: number;
  publicationsCount: number;
  textbooksCount: number;
  scopusWosCount: number;
  degree: "none" | "candidate" | "doctor";
  graduatesCount?: number | null;
}

interface CriteriaRules {
  academicExperienceYears: number;
  pedagogicalExperienceYears: number;
  publicationsCount: number;
  textbooksCount: number;
  scopusWosCount: number;
  requiredDegree: string;
  graduatesCount?: number | null;
}

interface CriterionResult {
  name: string;
  label: string;
  required: number;
  actual: number;
  met: boolean;
  shortage?: number | null;
}

interface CheckResult {
  status: "approved" | "partial" | "rejected";
  score: number;
  criteriaBreakdown: CriterionResult[];
  recommendations: string[];
  missingDocuments: string[];
}

// Проверяет соответствие соискателя критериям учёного звания
export function checkCriteria(data: ApplicantData, rules: CriteriaRules): CheckResult {
  const criteriaBreakdown: CriterionResult[] = [];
  const recommendations: string[] = [];
  const missingDocuments: string[] = [];

  // 1. Стаж научно-педагогической работы
  const academicMet = data.academicExperienceYears >= rules.academicExperienceYears;
  criteriaBreakdown.push({
    name: "academic_experience",
    label: "Стаж научно-педагогической работы (лет)",
    required: rules.academicExperienceYears,
    actual: data.academicExperienceYears,
    met: academicMet,
    shortage: academicMet ? null : rules.academicExperienceYears - data.academicExperienceYears,
  });
  if (!academicMet) {
    recommendations.push(`Необходимо доработать ещё ${rules.academicExperienceYears - data.academicExperienceYears} лет научно-педагогического стажа`);
    missingDocuments.push("Справка о стаже научно-педагогической работы");
  }

  // 2. Стаж педагогической работы по специальности
  const pedagogMet = data.pedagogicalExperienceYears >= rules.pedagogicalExperienceYears;
  criteriaBreakdown.push({
    name: "pedagogical_experience",
    label: "Стаж педагогической работы по специальности (лет)",
    required: rules.pedagogicalExperienceYears,
    actual: data.pedagogicalExperienceYears,
    met: pedagogMet,
    shortage: pedagogMet ? null : rules.pedagogicalExperienceYears - data.pedagogicalExperienceYears,
  });
  if (!pedagogMet) {
    recommendations.push(`Необходимо доработать ещё ${rules.pedagogicalExperienceYears - data.pedagogicalExperienceYears} лет педагогического стажа по специальности`);
    missingDocuments.push("Справка о педагогическом стаже по специальности");
  }

  // 3. Публикации в рецензируемых изданиях за 5 лет
  const pubMet = data.publicationsCount >= rules.publicationsCount;
  criteriaBreakdown.push({
    name: "publications",
    label: "Публикации в рецензируемых журналах за 5 лет",
    required: rules.publicationsCount,
    actual: data.publicationsCount,
    met: pubMet,
    shortage: pubMet ? null : rules.publicationsCount - data.publicationsCount,
  });
  if (!pubMet) {
    recommendations.push(`Необходимо опубликовать ещё ${rules.publicationsCount - data.publicationsCount} статей в рецензируемых журналах`);
    missingDocuments.push("Список публикаций в рецензируемых изданиях");
  }

  // 4. Учебные издания
  const textbooksMet = data.textbooksCount >= rules.textbooksCount;
  criteriaBreakdown.push({
    name: "textbooks",
    label: "Учебные издания (учебники, учебные пособия)",
    required: rules.textbooksCount,
    actual: data.textbooksCount,
    met: textbooksMet,
    shortage: textbooksMet ? null : rules.textbooksCount - data.textbooksCount,
  });
  if (!textbooksMet) {
    recommendations.push(`Необходимо подготовить ещё ${rules.textbooksCount - data.textbooksCount} учебное(-ых) издание(-й)`);
    missingDocuments.push("Сведения об учебных изданиях");
  }

  // 5. Публикации в Scopus/WoS
  const scopusMet = data.scopusWosCount >= rules.scopusWosCount;
  criteriaBreakdown.push({
    name: "scopus_wos",
    label: "Публикации в Scopus/Web of Science",
    required: rules.scopusWosCount,
    actual: data.scopusWosCount,
    met: scopusMet,
    shortage: scopusMet ? null : rules.scopusWosCount - data.scopusWosCount,
  });
  if (!scopusMet) {
    recommendations.push(`Необходимо опубликовать ещё ${rules.scopusWosCount - data.scopusWosCount} статей(-ью) в журналах Scopus/WoS`);
    missingDocuments.push("Справка из библиотеки о публикациях в Scopus/WoS");
  }

  // 6. Учёная степень
  const degreeMap: Record<string, number> = { none: 0, candidate: 1, doctor: 2 };
  const requiredDegreeLevel = degreeMap[rules.requiredDegree] ?? 1;
  const actualDegreeLevel = degreeMap[data.degree] ?? 0;
  const degreeMet = actualDegreeLevel >= requiredDegreeLevel;
  const degreeLabels: Record<string, string> = { none: "Нет", candidate: "Кандидат наук", doctor: "Доктор наук" };
  criteriaBreakdown.push({
    name: "degree",
    label: "Учёная степень",
    required: requiredDegreeLevel,
    actual: actualDegreeLevel,
    met: degreeMet,
  });
  if (!degreeMet) {
    recommendations.push(`Требуется учёная степень: ${degreeLabels[rules.requiredDegree] || rules.requiredDegree}`);
    missingDocuments.push("Диплом о присвоении учёной степени");
  }

  // 7. Для профессора: подготовка аспирантов (если указано в критериях)
  if (rules.graduatesCount && rules.graduatesCount > 0) {
    const graduatesActual = data.graduatesCount ?? 0;
    const graduatesMet = graduatesActual >= rules.graduatesCount;
    criteriaBreakdown.push({
      name: "graduates",
      label: "Подготовленные аспиранты (защитившиеся)",
      required: rules.graduatesCount,
      actual: graduatesActual,
      met: graduatesMet,
      shortage: graduatesMet ? null : rules.graduatesCount - graduatesActual,
    });
    if (!graduatesMet) {
      recommendations.push(`Необходимо подготовить ещё ${rules.graduatesCount - graduatesActual} аспиранта(-ов) к защите`);
      missingDocuments.push("Сведения о подготовленных аспирантах");
    }
  }

  // Вычисляем общий балл
  const metCount = criteriaBreakdown.filter(c => c.met).length;
  const totalCount = criteriaBreakdown.length;
  const score = Math.round((metCount / totalCount) * 100);

  // Определяем статус
  let status: "approved" | "partial" | "rejected";
  if (score === 100) {
    status = "approved";
  } else if (score >= 50) {
    status = "partial";
  } else {
    status = "rejected";
  }

  // Базовые документы для заявки
  missingDocuments.push("Заявление на имя ректора", "Копия паспорта", "Трудовая книжка");

  return { status, score, criteriaBreakdown, recommendations, missingDocuments };
}
