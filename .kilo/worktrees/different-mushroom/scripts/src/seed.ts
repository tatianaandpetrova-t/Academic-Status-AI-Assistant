// Скрипт для заполнения БД начальными данными
// Запуск: pnpm --filter @workspace/scripts run seed

import "./load-env";
import { db } from "@workspace/db";
import { usersTable, criteriaRulesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Начало заполнения базы данных...");

  // Создаём администратора по умолчанию
  const adminEmail = "admin@itmo.ru";
  const existingAdmin = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail)).limit(1);
  
  if (existingAdmin.length === 0) {
    const passwordHash = await bcrypt.hash("admin123", 10);
    await db.insert(usersTable).values({
      email: adminEmail,
      passwordHash,
      fullName: "Администратор ИТМО",
      department: "Учебно-методическое управление",
      position: "Документовед",
      role: "admin",
      isActive: true,
    });
    console.log("✓ Создан администратор: admin@itmo.ru / admin123");
  } else {
    console.log("— Администратор уже существует");
  }

  // Создаём тестового соискателя
  const applicantEmail = "ivanov@itmo.ru";
  const existingApplicant = await db.select().from(usersTable).where(eq(usersTable.email, applicantEmail)).limit(1);
  
  if (existingApplicant.length === 0) {
    const passwordHash = await bcrypt.hash("test123", 10);
    await db.insert(usersTable).values({
      email: applicantEmail,
      passwordHash,
      fullName: "Иванов Иван Иванович",
      department: "Кафедра информационных технологий",
      position: "Доцент",
      role: "applicant",
      isActive: true,
    });
    console.log("✓ Создан тестовый соискатель: ivanov@itmo.ru / test123");
  } else {
    console.log("— Тестовый соискатель уже существует");
  }

  // Создаём критерии для доцента
  const existingDocent = await db.select().from(criteriaRulesTable)
    .where(eq(criteriaRulesTable.rankType, "docent"))
    .limit(1);
  
  if (existingDocent.length === 0) {
    await db.insert(criteriaRulesTable).values({
      rankType: "docent",
      rulesJson: {
        academicExperienceYears: 5,
        pedagogicalExperienceYears: 3,
        publicationsCount: 10,
        textbooksCount: 2,
        scopusWosCount: 2,
        requiredDegree: "candidate",
        graduatesCount: null,
      },
      version: 1,
      isActive: true,
    });
    console.log("✓ Созданы критерии для доцента (Постановление РФ №1139)");
  } else {
    console.log("— Критерии для доцента уже существуют");
  }

  // Создаём критерии для профессора
  const existingProfessor = await db.select().from(criteriaRulesTable)
    .where(eq(criteriaRulesTable.rankType, "professor"))
    .limit(1);
  
  if (existingProfessor.length === 0) {
    await db.insert(criteriaRulesTable).values({
      rankType: "professor",
      rulesJson: {
        academicExperienceYears: 10,
        pedagogicalExperienceYears: 5,
        publicationsCount: 20,
        textbooksCount: 3,
        scopusWosCount: 5,
        requiredDegree: "doctor",
        graduatesCount: 1,
      },
      version: 1,
      isActive: true,
    });
    console.log("✓ Созданы критерии для профессора (Постановление РФ №1139)");
  } else {
    console.log("— Критерии для профессора уже существуют");
  }

  console.log("\nЗаполнение базы данных завершено!");
  console.log("\nТестовые аккаунты:");
  console.log("  Администратор: admin@itmo.ru / admin123");
  console.log("  Соискатель:    ivanov@itmo.ru / test123");
  process.exit(0);
}

seed().catch(err => {
  console.error("Ошибка при заполнении БД:", err);
  process.exit(1);
});
