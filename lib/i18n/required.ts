/**
 * Единый текст ошибки незаполненного обязательного поля во всех формах создания:
 *   he: «יש למלא: {field}»  ·  ru: «Заполните: {field}»  ·  en: «Please fill in: {field}»
 * fieldLabel — уже локализованное название поля (то же, что в подписи со звёздочкой).
 */
export function requiredFieldMsg(
  tCommon: (key: string, fallback?: string) => string,
  fieldLabel: string,
): string {
  return tCommon('required_field').replace('{field}', fieldLabel)
}
