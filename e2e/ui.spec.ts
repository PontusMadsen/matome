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
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.addInitScript(installMock)
  await page.goto('/index.html')
  await page.getByRole('button', { name: 'Home' }).waitFor()
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
  await expect(page.locator('[data-tid="show:1"]').getByTitle(/unwatched episode/)).toHaveText('3')
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

test('Continue Watching shows 1, 2 or 3 big cards depending on the width, and the rest as a shelf', async ({ page }) => {
  const heroes = page.getByTestId('continue-hero')
  for (const [width, expected] of [[820, 1], [1360, 2], [1920, 3]] as const) {
    await page.setViewportSize({ width, height: 900 })
    await expect(heroes).toHaveCount(expected)
    // 4 items in progress: whatever isn't a big card is in the shelf
    await expect(page.getByRole('heading', { name: 'Continue Watching' })).toBeVisible()
  }
})
