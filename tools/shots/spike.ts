// Spike: drive the built extension in release Firefox and save screenshots.
// Route 1: selenium-webdriver + geckodriver (resolved by Selenium Manager).
// Usage: SHOTS_FIREFOX="<path to firefox.exe>" npx jiti tools/shots/spike.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Builder, By, until, type WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox';

const EXT_ID = 'countersign@firegiant9000';
const UUID = '5d1a7f3e-8c2b-4e6a-9b0d-2f4c6a8e1b37';
const ROOT = resolve(__dirname, '../..');
const EXT_DIR = join(ROOT, '.output/firefox-mv3');
const OUT_DIR = join(ROOT, '.output/shots');
const base = `moz-extension://${UUID}/`;

async function session(opts: {
  dark: boolean;
  width: number;
  height: number;
}): Promise<WebDriver> {
  const binary = process.env.SHOTS_FIREFOX;
  if (!binary)
    throw new Error('Set SHOTS_FIREFOX to the Firefox executable path');
  // Lets Marionette use the chrome context (needed to open moz-extension:// tabs).
  process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';
  const options = new firefox.Options();
  options.setBinary(binary);
  options.addArguments(
    '-headless',
    `--width=${opts.width}`,
    `--height=${opts.height}`,
  );
  options.setPreference(
    'extensions.webextensions.uuids',
    JSON.stringify({ [EXT_ID]: UUID }),
  );
  // 0 = dark, 1 = light. Left unset it follows the OS theme, so always set it.
  options.setPreference(
    'layout.css.prefers-color-scheme.content-override',
    opts.dark ? 0 : 1,
  );
  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .build();
  // Temporary install; the add-on goes away with the session.
  await (
    driver as unknown as {
      installAddon(p: string, t: boolean): Promise<string>;
    }
  ).installAddon(EXT_DIR, true);
  return driver;
}

// Marionette refuses driver.get() for moz-extension:// URLs, so open the first
// page as a new tab from the chrome context, then switch to it.
async function openExtensionTab(driver: WebDriver, url: string): Promise<void> {
  const before = await driver.getAllWindowHandles();
  const d = driver as unknown as { setContext(c: unknown): Promise<void> };
  await d.setContext(firefox.Context.CHROME);
  await driver.executeScript(
    `const t = gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
     gBrowser.selectedTab = t;`,
    url,
  );
  await d.setContext(firefox.Context.CONTENT);
  await driver.wait(
    async () => (await driver.getAllWindowHandles()).length > before.length,
    10000,
  );
  const handles = await driver.getAllWindowHandles();
  await driver
    .switchTo()
    .window(handles.find((h) => !before.includes(h)) as string);
}

// Resize the window so the page viewport (not the window) is width x height.
async function setViewport(
  driver: WebDriver,
  width: number,
  height: number,
): Promise<void> {
  const [dw = 0, dh = 0] = await driver.executeScript<number[]>(
    'return [outerWidth - innerWidth, outerHeight - innerHeight];',
  );
  await driver
    .manage()
    .window()
    .setRect({ width: width + dw, height: height + dh });
  await driver.sleep(300);
  const size = await driver.executeScript<number[]>(
    'return [innerWidth, innerHeight];',
  );
  console.log(`viewport ${size.join('x')} (wanted ${width}x${height})`);
}

async function save(driver: WebDriver, name: string): Promise<string> {
  const file = join(OUT_DIR, name);
  writeFileSync(file, await driver.takeScreenshot(), 'base64');
  console.log(`saved ${file}`);
  return file;
}

async function dashboardShot(dark: boolean, name: string): Promise<void> {
  const driver = await session({ dark, width: 1280, height: 900 });
  try {
    await openExtensionTab(driver, `${base}dashboard.html#/data`);
    await setViewport(driver, 1280, 900);
    const demo = await driver.wait(
      until.elementLocated(
        By.xpath("//button[normalize-space()='Load demo data']"),
      ),
      10000,
    );
    await demo.click();
    await driver.sleep(500);
    await driver.executeScript("location.hash = '#/applications';");
    await driver.sleep(800);
    const size = await driver.executeScript<number[]>(
      'return [innerWidth, innerHeight];',
    );
    console.log(`${name} viewport ${size.join('x')}`);
    await save(driver, name);
  } finally {
    await driver.quit();
  }
}

async function popupShot(): Promise<void> {
  const driver = await session({ dark: false, width: 360, height: 600 });
  try {
    await openExtensionTab(driver, `${base}popup.html`);
    await setViewport(driver, 360, 600);
    await driver.wait(
      until.elementLocated(
        By.xpath('//*[contains(., "This page can\'t be read")]'),
      ),
      10000,
    );
    const size = await driver.executeScript<number[]>(
      'return [innerWidth, innerHeight];',
    );
    console.log(`popup viewport ${size.join('x')}`);
    // Headless Firefox will not shrink a window below ~500px wide, so crop the
    // root element to the popup's 360x600 box and capture just that.
    await driver.executeScript(
      "const s = document.documentElement.style; s.width = '360px'; s.height = '600px'; s.overflow = 'hidden';",
    );
    const png = await driver.findElement(By.css('html')).takeScreenshot();
    const file = join(OUT_DIR, 'popup.png');
    writeFileSync(file, png, 'base64');
    console.log(`saved ${file}`);
  } finally {
    await driver.quit();
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  await dashboardShot(false, 'applications-light.png');
  await dashboardShot(true, 'applications-night.png');
  await popupShot();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
