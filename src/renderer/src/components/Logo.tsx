import symbolDark from '../assets/logo-symbol-dark.svg'
import symbolInk from '../assets/logo-symbol-ink.svg'
import s from './Logo.module.css'

/**
 * Sidebar logo: the symbol plus the name in the UI font. Placeholder until the final Matome wordmark exists:
 * replace the two SVGs in assets/ (and swap the text for the wordmark image here) and nothing else needs to change.
 * The dark-on-light symbol is shown by skins with a light sidebar (see styles/skins.css).
 */
export function Logo() {
  return (
    <div className={s.logo} data-ui="logo">
      <img className={s.symbol} data-logo="light-on-dark" src={symbolDark} alt="" draggable={false} />
      <img className={s.symbol} data-logo="dark-on-light" src={symbolInk} alt="" aria-hidden draggable={false} />
      <span className={s.word}>Matome</span>
    </div>
  )
}
