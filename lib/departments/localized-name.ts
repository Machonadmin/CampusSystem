// Имя подразделения на нужном языке идентично универсальному localizedName
// (те же поля name/name_he/name_en, та же логика отката к RU). Единая
// каноническая копия — в lib/i18n/localized-name.ts; здесь только реэкспорт
// под историческими именами DeptNames / localizedDeptName (call sites не меняются).
export type { LocalizableName as DeptNames } from '@/lib/i18n/localized-name'
export { localizedName as localizedDeptName } from '@/lib/i18n/localized-name'
