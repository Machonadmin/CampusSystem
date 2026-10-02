import Image from 'next/image'

/**
 * Эмблема мокона (звезда с пером). Исходник — лого1.pdf владельца, эмблема
 * вырезана и очищена от белого фона. Две версии: обычная (тёмно-синяя звезда)
 * и для тёмной темы (светлая звезда) — переключаются CSS-классами из
 * globals.css по той же схеме, что и токены темы. `themed={false}` — для
 * страниц без тёмной темы (публичная /apply), там всегда обычная версия.
 */
const RATIO = 261 / 256

export function InstitutionLogo({
  height,
  alt = '',
  priority = false,
  themed = true,
  className,
}: {
  height: number
  alt?: string
  priority?: boolean
  themed?: boolean
  className?: string
}) {
  const width = Math.round(height * RATIO)
  const style = { height, width: 'auto', objectFit: 'contain' as const, flexShrink: 0 }
  if (!themed) {
    return <Image src="/logo.png" alt={alt} width={width} height={height} priority={priority} className={className} style={style} />
  }
  return (
    <>
      <Image src="/logo.png" alt={alt} width={width} height={height} priority={priority}
        className={`brand-logo-light ${className ?? ''}`} style={style} />
      <Image src="/logo-dark.png" alt={alt} width={width} height={height} priority={priority}
        className={`brand-logo-dark ${className ?? ''}`} style={style} />
    </>
  )
}
