import type { CatalogSeed, Course } from '@wylie/contracts';

// Deliberately fictional identities. Stable UUIDs are data, not simulator code constants.
export const demoTerms = [
  { id: '10000000-0000-4000-8000-000000000001', name: '2025 秋（上线前）', ordinal: 1, from: '2025-09-01', through: '2026-01-15', isLaunchTerm: false },
  { id: '10000000-0000-4000-8000-000000000002', name: '2026 春（上一完成）', ordinal: 2, from: '2026-02-01', through: '2026-07-15', isLaunchTerm: true },
  { id: '10000000-0000-4000-8000-000000000003', name: '2026 秋（当前）', ordinal: 3, from: '2026-09-01', through: '2027-01-15', isLaunchTerm: false },
  { id: '10000000-0000-4000-8000-000000000004', name: '2027 春（未来）', ordinal: 4, from: '2027-02-01', through: '2027-07-15', isLaunchTerm: false },
] as const;
export const demoCourses: Course[] = [
  { id: 'MATH101', name: '离散数学', department: '科学部', credits: '3.00', prerequisiteCourseIds: [] },
  { id: 'PHYS101', name: '基础物理', department: '科学部', credits: '4.00', prerequisiteCourseIds: [] },
  { id: 'CS201', name: '算法设计', department: '科学部', credits: '3.50', prerequisiteCourseIds: ['MATH101'] },
  { id: 'ART101', name: '视觉艺术', department: '人文部', credits: '2.00', prerequisiteCourseIds: [] },
  { id: 'HIST101', name: '世界历史', department: '人文部', credits: '3.00', prerequisiteCourseIds: [] },
  { id: 'WRITE101', name: '学术写作', department: '人文部', credits: '2.50', prerequisiteCourseIds: [] },
  { id: 'MUSIC101', name: '音乐欣赏', department: '人文部', credits: '2.00', prerequisiteCourseIds: [] },
  { id: 'BIO101', name: '生物概论', department: '科学部', credits: '4.00', prerequisiteCourseIds: [] },
];
export const demoCatalogSeed: CatalogSeed = {
  catalogs: demoTerms.map((term) => ({
    revision: '1', termId: term.id, courses: demoCourses,
    offerings: demoCourses.map((course, index) => ({
      id: `T${term.ordinal}-${course.id}-A`, courseId: course.id, termId: term.id,
      meetings: [{ dayOfWeek: (index % 5) + 1, startMinute: index < 5 ? 540 : 840, endMinute: index < 5 ? 630 : 930, fromDate: term.from, throughDate: term.through }],
    })),
  })),
};
