import lockupDark from '../assets/lockup-dark.svg'
import lockupInk from '../assets/lockup-ink.svg'
import s from './Logo.module.css'

/**
 * Sidebar logo: the official horizontal lockup (symbol + wordmark) from the brand kit in brand/.
 * Teal-light on dark skins; black on light-sidebar skins (see styles/skins.css). Keep it at 120px wide or more.
 */
export function Logo() {
  return (
    <div className={s.logo} data-ui="logo" role="img" aria-label="Matome">
      <img className={s.lockup} data-logo="light-on-dark" src={lockupDark} alt="" draggable={false} />
      <img className={s.lockup} data-logo="dark-on-light" src={lockupInk} alt="" aria-hidden draggable={false} />
    </div>
  )
}
