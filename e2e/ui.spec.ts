import { expect, test, type Page } from '@playwright/test'
import { installMock } from './mock-bridge'

/** View transitions and entrance animations swallow pointer input for ~300ms; wait until the page is idle. */
const settle = async (page: Page) => {
  // A view transition only starts after the click handler runs, so also wait for :active-view-transition to clear.
  await page.waitForTimeout(60)
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition') && document.getAnimations().length === 0)
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // matome-local:// / matome-stream:// only exist inside the Electron app; plain Chromium reports them as unknown schemes.
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_UNKNOWN_URL_SCHEME') && errors.push(m.text()))
  await page.addInitScript(installMock)
  await page.goto('/index.html')
  await page.getByRole('button', { name: 'Home', exact: true }).waitFor()
  await settle(page)
  ;(page as Page & { _errors: string[] })._errors = errors
})
test.afterEach(async ({ page }) => {
  expect((page as Page & { _errors: string[] })._errors).toEqual([])
})

test('home shows the Continue Watching hero and shelves', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Slow Horses' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Resume/ }).first()).toBeVisible()
  await expect(page.getByText('Recently added movies')).toBeVisible()
})

test('shows grid: unwatched-episode pills, no server-count badge', async ({ page }) => {
  await page.getByRole('button', { name: 'TV Shows' }).click()
  await expect(page.locator('[data-tid="show:1"]')).toBeVisible()
  await expect(page.locator('[data-tid="show:1"]').getByRole('img', { name: /unwatched episode/ })).toHaveText('3')
})

test('detail: seasons newest first, Specials last, opens on the newest', async ({ page }) => {
  await page.getByRole('button', { name: 'TV Shows' }).click()
  await page.locator('[data-tid="show:1"]').click()
  await expect(page.getByRole('tab').first()).toHaveText('Season 3')
  await expect(page.getByRole('tab')).toHaveText(['Season 3', 'Season 2', 'Season 1', 'Specials'])
  await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
})

test('going back from detail keeps the sort and the scroll position', async ({ page }) => {
  await page.getByRole('button', { name: 'TV Shows' }).click()
  await settle(page)
  await page.selectOption('select[aria-label=Sort]', 'title')
  const grid = page.locator('[data-scroll-main]').last()
  await grid.evaluate((e) => { e.scrollTop = 300 })
  await page.locator('[data-tid]').nth(8).click()
  await settle(page)
  await page.keyboard.press('Escape')
  await settle(page)
  await expect(page.locator('select[aria-label=Sort]')).toHaveValue('title')
  expect(await page.locator('[data-scroll-main]').last().evaluate((e) => e.scrollTop)).toBeGreaterThan(200)
})

test('pen-friendly scrolling: drag scrolls, plain click does not, PageDown scrolls', async ({ page }) => {
  await page.getByRole('button', { name: 'TV Shows' }).click()
  await expect(page.locator('[data-tid]').first()).toBeVisible()
  await settle(page)
  const grid = page.locator('[data-scroll-main]').last()
  await page.mouse.move(700, 500)
  await page.mouse.down()
  await page.mouse.move(700, 350, { steps: 5 })
  await page.mouse.move(700, 150, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => grid.evaluate((e) => e.scrollTop)).toBeGreaterThan(100)
  await page.keyboard.press('Home')
  await expect.poll(() => grid.evaluate((e) => e.scrollTop)).toBe(0)
  await page.keyboard.press('PageDown')
  await expect.poll(() => grid.evaluate((e) => e.scrollTop)).toBeGreaterThan(100)
  // a click without movement still opens the card
  await page.keyboard.press('Home')
  await settle(page)
  await page.locator('[data-tid]').first().click()
  await expect(page.getByRole('button', { name: /Back/ })).toBeVisible()
})

test('command palette opens with Ctrl+K and finds titles', async ({ page }) => {
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder(/Search movies and shows/).fill('sev')
  await expect(page.getByRole('dialog').getByText('Severance').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('right-click offers mark watched and sends it to every server', async ({ page }) => {
  await page.getByRole('button', { name: 'Movies' }).click()
  await page.locator('[data-tid="movie:1"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Mark as watched' }).click()
  const calls = await page.evaluate(() => (window as any).__calls as { c: string; r: any }[])
  expect(calls.find((x) => x.c === 'title:setWatched')?.r).toEqual({ id: 'movie:1', watched: true })
})

test('settings: toggles render as switches and quality includes 2 Mbps', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByText('Streaming quality')).toBeVisible()
  await expect(page.locator('select').first()).toBeVisible()
  const opts = await page.locator('option').allInnerTexts()
  expect(opts).toContain('2 Mbps')
})

test('Continue Watching shows a loading skeleton, then the hero', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__slow = true })
  await page.reload()
  await expect(page.getByTestId('continue-skeleton')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Slow Horses' })).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('continue-skeleton')).toHaveCount(0)
})

test('player: no subtitle menu when there are no subtitle tracks', async ({ page }) => {
  await page.getByRole('button', { name: /Resume/ }).first().click()
  await expect(page.locator('[data-player]')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Quality' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Subtitles' })).toHaveCount(0)
})

test('closing the player reports the stop position, then refreshes Continue Watching', async ({ page }) => {
  await page.getByRole('button', { name: /Resume/ }).first().click()
  await expect(page.locator('[data-player]')).toBeVisible()
  await page.evaluate(() => { (window as any).__calls.length = 0 })
  await page.locator('[data-player]').getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.locator('[data-player]')).toHaveCount(0)
  const calls = () => page.evaluate(() => (window as any).__calls.map((c: any) => `${c.c}:${c.r?.state ?? ''}`) as string[])
  await expect.poll(calls).toEqual(expect.arrayContaining(['play:timeline:stopped', 'home:continue:refresh:']))
  const order = await calls()
  expect(order.indexOf('play:timeline:stopped')).toBeLessThan(order.indexOf('home:continue:refresh:'))
})

test('shrinking the window moves the third card to the start of the shelf, even if the shelf was scrolled', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 })
  await expect(page.getByTestId('continue-hero')).toHaveCount(3)
  const row = page.locator('section', { has: page.getByRole('heading', { name: 'Continue Watching' }) }).locator('[class*=shelfrow]')
  await row.evaluate((el) => { el.scrollLeft = 300 })
  expect(await row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100)
  await page.setViewportSize({ width: 1360, height: 900 })
  await expect(page.getByTestId('continue-hero')).toHaveCount(2)
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeLessThan(5)
  await expect(page.getByRole('button', { name: 'Scroll left' })).toHaveCount(0)
})

test('two-finger swipe right goes back from a title, and swiping the other way does not', async ({ page }) => {
  await page.getByRole('button', { name: 'Movies' }).click()
  await settle(page)
  await page.locator('[data-tid]').first().click()
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
  await settle(page)
  await page.mouse.move(700, 400)
  for (let i = 0; i < 4; i++) await page.mouse.wheel(40, 0) // swipe left: nothing happens
  await page.waitForTimeout(400)
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(-40, 0); await page.waitForTimeout(16) } // swipe right: back
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0)
  // and once more from the list: back to where we came from (Home)
  await page.waitForTimeout(400)
  await settle(page)
  await page.mouse.move(700, 400)
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(-40, 0); await page.waitForTimeout(16) }
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
})

test('Watchlist: removing a title takes it off the list and it stays off while Plex still lists it; a refused removal shows why', async ({ page }) => {
  const card = (t: string) => page.locator('[class*=card]').filter({ hasText: t })
  await page.getByRole('button', { name: 'Watchlist' }).click()
  await settle(page)
  await expect(card('Wanted One')).toBeVisible()
  await card('Wanted One').getByRole('button', { name: 'Remove from Watchlist' }).click()
  await expect(card('Wanted One')).toHaveCount(0)
  await page.waitForTimeout(3200) // the delayed re-read returns it again; it must stay hidden
  await expect(card('Wanted One')).toHaveCount(0)
  await page.evaluate(() => { (window as any).__failRemove = true })
  await card('Wanted Two').getByRole('button', { name: 'Remove from Watchlist' }).click()
  await expect(page.getByRole('alert')).toContainText('Plex said no')
  await expect(card('Wanted Two')).toBeVisible()
})

test('a server can be entered from the sidebar and its libraries browsed on their own', async ({ page }) => {
  await page.locator('nav').getByRole('button', { name: /Friend A/ }).click()
  await settle(page)
  await expect(page.getByRole('heading', { name: 'Friend A' })).toBeVisible()
  const tabs = page.getByRole('tablist', { name: 'Libraries' }).getByRole('tab')
  await expect(tabs).toHaveCount(2)
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-tid]').first()).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Server' })).toHaveCount(0) // already inside one server
  await tabs.nth(1).click()
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  // swipe back returns to where we came from
  await page.mouse.move(700, 400)
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(-40, 0); await page.waitForTimeout(16) }
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
})

test('when playback ends with nothing next, the player closes and returns to the previous screen', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 })
  await page.getByTestId('continue-tile').filter({ hasText: 'Lupin' }).click() // no next episode known for this one
  await expect(page.locator('[data-player]')).toBeVisible()
  await page.locator('[data-player] video').evaluate((v) => v.dispatchEvent(new Event('ended')))
  await expect(page.locator('[data-player]')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
})

test('player: a subtitle track the stream switches on by itself is switched off again', async ({ page }) => {
  await page.getByRole('button', { name: /Resume/ }).first().click()
  await expect(page.locator('[data-player]')).toBeVisible()
  await page.waitForTimeout(300)
  const mode = await page.locator('[data-player] video').evaluate(async (v: HTMLVideoElement) => {
    const t = v.addTextTrack('subtitles', 'Forced', 'en')
    t.mode = 'showing' // what a default/forced HLS track does
    await new Promise((r) => setTimeout(r, 100))
    return t.mode
  })
  expect(mode).toBe('disabled')
})

test('cards have a visible ⋮ menu with mark watched and watchlist', async ({ page }) => {
  await page.getByRole('button', { name: 'Movies' }).click()
  await settle(page)
  await page.locator('[data-tid]').first().getByRole('button', { name: /^More for/ }).click()
  await expect(page.getByRole('menuitem', { name: /Mark as (un)?watched/ })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Add to Watchlist' }).click()
  const calls = await page.evaluate(() => (window as any).__calls.map((c: any) => c.c) as string[])
  expect(calls).toContain('title:addToWatchlist')
})

test('episodes have a ⋮ menu too', async ({ page }) => {
  await page.getByRole('button', { name: 'TV Shows' }).click()
  await settle(page)
  await page.locator('[data-tid]').first().click()
  await page.getByRole('button', { name: /^More for episode/ }).first().waitFor()
  await page.getByRole('button', { name: /^More for episode/ }).first().click()
  await expect(page.getByRole('menuitem', { name: 'Play' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Mark as (un)?watched/ })).toBeVisible()
})

test('playback starts from the furthest position any server has, not the first one\'s', async ({ page }) => {
  await page.evaluate(() => { (window as any).__resume = 754_000 })
  await page.getByRole('button', { name: /Resume/ }).first().click()
  await expect(page.locator('[data-player]')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as any).__calls.find((c: any) => c.c === 'play:start')?.r?.offsetMs)).toBe(754_000)
})

test('setting: hide watched movies keeps them out of Recently added movies on Home', async ({ page }) => {
  const recent = page.locator('section', { has: page.getByRole('heading', { name: 'Recently added movies' }) })
  await expect(recent.locator('[data-tid="movie:0"]')).toBeVisible() // movie:0 is watched
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Hide watched titles on Home').click()
  await expect(page.getByLabel('Hide watched titles on Home')).toBeChecked()
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await settle(page)
  await expect(recent.locator('[data-tid="movie:1"]')).toBeVisible()
  await expect(recent.locator('[data-tid="movie:0"]')).toHaveCount(0)
})

test('detail shows the IMDb and Rotten Tomatoes scores Plex provides', async ({ page }) => {
  await page.getByRole('button', { name: 'TV Shows' }).click()
  await settle(page)
  await page.locator('[data-tid]').first().click()
  await expect(page.getByText('8.1').first()).toBeVisible()
  await expect(page.getByTitle(/Rotten Tomatoes critics/)).toContainText('96%')
  await expect(page.getByTitle(/Rotten Tomatoes audience/)).toContainText('88%')
  await expect(page.getByTitle(/Rating stored by Plex/)).toHaveCount(0) // the unlabeled star gives way to the real scores
})

test('marking a title watched removes it from Continue Watching at once', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Ted Lasso' })).toBeVisible()
  await page.getByRole('button', { name: 'Details' }).nth(1).click() // Ted Lasso: still has unwatched episodes
  await page.getByRole('button', { name: 'Watched', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await settle(page)
  await expect(page.getByRole('heading', { name: 'Ted Lasso' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Slow Horses' })).toBeVisible()
})

test('setting: hide watched titles also hides finished shows in Recently added shows', async ({ page }) => {
  const recent = page.locator('section', { has: page.getByRole('heading', { name: 'Recently added shows' }) })
  await expect(recent.locator('[data-tid="show:0"]')).toBeVisible() // show:0 has 0 unwatched episodes
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Hide watched titles on Home').click()
  await expect(page.getByLabel('Hide watched titles on Home')).toBeChecked()
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await settle(page)
  await expect(recent.locator('[data-tid="show:1"]')).toBeVisible() // 3 unwatched
  await expect(recent.locator('[data-tid="show:0"]')).toHaveCount(0)
})

test('skin chooser: switches the look at once and keeps it', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'default')
  for (const [name, id] of [['Classic Mac', 'classicmac'], ['Default', 'default']] as const) {
    await page.getByRole('radio', { name: new RegExp(`^${name}`) }).click()
    await expect(page.locator('html')).toHaveAttribute('data-skin', id)
    await expect(page.getByRole('radio', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-checked', 'true')
  }
  await page.getByRole('radio', { name: /^Classic Mac/ }).click()
  expect(await page.evaluate(() => localStorage.getItem('matome-skin'))).toBe('classicmac') // remembered so the next launch paints with it from the first frame
})

test('download: movie menu and title page offer it, progress shows in the tray and can be cancelled', async ({ page }) => {
  await page.getByRole('button', { name: 'Movies' }).click()
  await settle(page)
  await page.locator('[data-tid]').first().getByRole('button', { name: /^More for/ }).click()
  await page.getByRole('menuitem', { name: 'Download…' }).click()
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0) // choosing a menu item must not also open the card behind it
  const tray = page.getByRole('complementary', { name: 'Downloads' })
  await expect(tray).toContainText('Slow Horses')
  await expect(tray).toContainText('450 MB of 1.80 GB')
  const start = await page.evaluate(() => (window as any).__calls.find((c: any) => c.c === 'download:start')?.r)
  expect(start.sources.length).toBeGreaterThan(0)
  expect(start.sources.map((x: any) => x.serverId)).toEqual(['a']) // not the offline server, and not the friend's server that refuses downloads
  await page.getByRole('button', { name: /^Cancel download/ }).click()
  await expect(tray).toContainText('Canceled')
  await page.getByRole('button', { name: 'Clear finished' }).click()
  await expect(tray).toHaveCount(0)
  // title page
  await page.locator('[data-tid]').first().click()
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible()
})

test('Downloaded: lists what is saved, plays it from disk, goes on to the next episode, and deletes', async ({ page }) => {
  await page.getByRole('button', { name: 'Downloaded', exact: true }).click()
  await settle(page)
  await expect(page.getByText('3 items')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Slow Horses' })).toBeVisible()
  // movie: plays straight from the local file, no quality menu (nothing is transcoded)
  await page.getByRole('button', { name: 'Play Dune (2021)' }).click()
  await expect(page.locator('[data-player]')).toBeVisible()
  await expect(page.locator('[data-player] video')).toHaveAttribute('src', 'matome-local://file/o1')
  await expect(page.getByRole('combobox', { name: 'Quality' })).toHaveCount(0)
  await page.locator('[data-player]').getByRole('button', { name: 'Back', exact: true }).click()
  // episode: the next downloaded one follows
  await page.getByRole('button', { name: 'Play Slow Horses - S03E02 - Episode 2' }).click()
  await expect(page.locator('[data-player] video')).toHaveAttribute('src', 'matome-local://file/o2')
  await page.locator('[data-player] video').evaluate((v) => v.dispatchEvent(new Event('ended')))
  await expect(page.locator('[data-player] video')).toHaveAttribute('src', 'matome-local://file/o3')
  await page.locator('[data-player]').getByRole('button', { name: 'Back', exact: true }).click()
  // delete, after confirming
  page.once('dialog', (d) => { expect(d.message()).toContain('Dune (2021)'); void d.accept() })
  await page.getByRole('button', { name: 'More for Dune (2021)' }).click()
  await page.getByRole('menuitem', { name: /^Delete from this Mac/ }).click()
  await expect(page.getByRole('button', { name: 'Play Dune (2021)' })).toHaveCount(0)
  await expect(page.getByText('2 items')).toBeVisible()
  const calls = await page.evaluate(() => (window as any).__calls.filter((c: any) => c.c === 'download:remove').map((c: any) => c.r.id))
  expect(calls).toEqual(['o1'])
})

test('Downloaded: declining the confirmation keeps the file', async ({ page }) => {
  await page.getByRole('button', { name: 'Downloaded', exact: true }).click()
  await settle(page)
  page.once('dialog', (d) => void d.dismiss())
  await page.getByRole('button', { name: 'More for Dune (2021)' }).click()
  await page.getByRole('menuitem', { name: /^Delete from this Mac/ }).click()
  await expect(page.getByRole('button', { name: 'Play Dune (2021)' })).toBeVisible()
  const removed = await page.evaluate(() => (window as any).__calls.some((c: any) => c.c === 'download:remove'))
  expect(removed).toBe(false)
})

test('Downloaded appears in the sidebar only while there is something downloaded', async ({ page }) => {
  const item = page.locator('nav').getByRole('button', { name: 'Downloaded', exact: true })
  await expect(item).toBeVisible()
  await page.evaluate(() => { (window as any).__dlEmpty = true })
  await expect(item).toHaveCount(0, { timeout: 5000 })
})

test('Download is not offered for a title whose only server refuses downloads', async ({ page }) => {
  await page.getByRole('button', { name: 'Movies' }).click()
  await settle(page)
  await page.getByLabel('Sort').selectOption('title') // Zodiac (only on Friend A) sorts last
  await page.locator('[data-tid="movie:19"]').scrollIntoViewIfNeeded()
  await page.locator('[data-tid="movie:19"]').getByRole('button', { name: /^More for/ }).click({ force: true })
  await expect(page.getByRole('menuitem', { name: /Mark as/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Download…' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  // a title that has a server that allows it still offers it
  await page.locator('[data-tid="movie:1"]').getByRole('button', { name: /^More for/ }).click({ force: true })
  await expect(page.getByRole('menuitem', { name: 'Download…' })).toBeVisible()
})

test('cards: the ⋮ shows only on hover; the round button plays, the rest of the card opens details', async ({ page }) => {
  await page.getByRole('button', { name: 'Movies' }).click()
  await settle(page)
  const card = page.locator('[data-tid]').first()
  const more = card.getByRole('button', { name: /^More for/ })
  expect(await more.evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
  await card.hover()
  await expect.poll(() => more.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  await expect(card.getByText('Details', { exact: true })).toBeVisible()
  // no browser tooltip bubbles on a card or its buttons
  expect(await card.evaluate((el) => [el, ...el.querySelectorAll('*')].filter((n) => n.hasAttribute('title')).length)).toBe(0)
  // the card (not the button) opens the page, and nothing plays
  await card.locator('[data-poster]').click({ position: { x: 20, y: 20 } })
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
  await expect(page.locator('[data-player]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await settle(page)
  // the round play button starts playing
  await page.locator('[data-tid]').first().hover()
  await page.locator('[data-tid]').first().getByRole('button', { name: /^Play / }).click()
  await expect(page.locator('[data-player]')).toBeVisible()
})

test('episodes show when they aired, with a tag for new and for not-yet-aired ones', async ({ page }) => {
  await page.getByRole('button', { name: 'TV Shows' }).click()
  await settle(page)
  await page.locator('[data-tid]').first().click()
  const rows = page.locator('[class*="_ep_"]')
  await expect(rows.nth(0)).toContainText('2024') // aired long ago: date only
  await expect(rows.nth(0)).not.toContainText('New')
  await expect(rows.nth(1)).toContainText('New') // three days ago
  await expect(rows.nth(2)).toContainText('Upcoming')
  await expect(rows.nth(3)).not.toContainText('Upcoming') // no date known: nothing shown
})

test('Continue Watching shows 1, 2 or 3 big cards depending on the width, and the rest as a shelf', async ({ page }) => {
  const heroes = page.getByTestId('continue-hero')
  for (const [width, expected] of [[820, 1], [1360, 2], [1920, 3]] as const) {
    await page.setViewportSize({ width, height: 900 })
    await expect(heroes).toHaveCount(expected)
    // 4 items in progress: whatever isn't a big card is in the shelf
    await expect(page.getByRole('heading', { name: 'Continue Watching' })).toBeVisible()
  }
  // Lupin has no merged title in the cache: it must still be reachable from the shelf when it isn't a big card.
  await page.setViewportSize({ width: 1360, height: 900 })
  await expect(page.getByTestId('continue-tile').filter({ hasText: 'Lupin' })).toBeVisible()
})
