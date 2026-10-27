import { _electron as electron, expect, test } from '@playwright/test'

test('app launches with sidebar', async () => {
  const app = await electron.launch({ args: ['.'] })
  const win = await app.firstWindow()
  await expect(win.getByRole('button', { name: 'Movies' })).toBeVisible()
  await app.close()
})
