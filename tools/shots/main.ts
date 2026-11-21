// Dev-only: drive the built extension in release Firefox and save day and night
// screenshots of every page into .shots/<stamp>/<theme>/.
// Usage: SHOTS_FIREFOX="<path to firefox.exe>" npm run shots   (after npm run build)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Builder, By, until, type WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox';
import {
  outputDir,
  popupProblem,
  shotPlan,
  type PopupMeasurement,
  type Shot,
  type Theme,
} from './plan';

const EXT_ID = 'countersign@firegiant9000';
// Pre-seeded in the profile so the extension's moz-extension:// origin is known.
const UUID = '5d1a7f3e-8c2b-4e6a-9b0d-2f4c6a8e1b37';
const ROOT = resolve(__dirname, '../..');
const EXT_DIR = join(ROOT, '.output', 'firefox-mv3');
const BASE = `moz-extension://${UUID}/`;
const LONG_URL = `https://example.com/${'a'.repeat(200)}`;

function resolveBinary(): string {
  const raw = process.env.SHOTS_FIREFOX;
  if (!raw) {
    throw new Error(
      'SHOTS_FIREFOX is not set. Point it at a release Firefox executable (see .env.example).',
    );
  }
  // Firefox exits at startup on a forward-slash Windows path; normalise it.
  const binary = resolve(raw);
  if (!existsSync(binary)) {
    throw new Error(`SHOTS_FIREFOX does not exist: ${binary}`);
  }
  return binary;
}

async function startSession(
  binary: string,
  theme: Theme,
): Promise<firefox.Driver> {
  const options = new firefox.Options();
  options.setBinary(binary);
  options.addArguments('-headless', '--width=1280', '--height=900');
  options.setPreference(
    'extensions.webextensions.uuids',
    JSON.stringify({ [EXT_ID]: UUID }),
  );
  // 1 = light, 0 = dark. Left unset it follows the OS theme, so always set it.
  options.setPreference(
    'layout.css.prefers-color-scheme.content-override',
    theme === 'night' ? 0 : 1,
  );
  // Lets Marionette use the chrome context (needed to open moz-extension://
  // tabs). Scoped to the geckodriver process, not this one. WEB_EXT_* release
  // keys were already removed from process.env in main().
  const service = new firefox.ServiceBuilder().setEnvironment({
    ...process.env,
    MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1',
  });
  const driver = (await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    .build()) as firefox.Driver;
  try {
    // Temporary install; the add-on goes away with the session.
    await driver.installAddon(EXT_DIR, true);
  } catch (err) {
    await driver.quit().catch(() => undefined);
    throw err;
  }
  return driver;
}

// Marionette refuses driver.get() for moz-extension:// URLs, so open the page as
// a new tab from the chrome context, then switch to it. The script text is
// static; the URL goes in as an argument.
async function openExtensionTab(
  driver: firefox.Driver,
  url: string,
): Promise<void> {
  const before = await driver.getAllWindowHandles();
  await driver.setContext(firefox.Context.CHROME);
  try {
    await driver.executeScript(
      `const t = gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
       gBrowser.selectedTab = t;`,
      url,
    );
  } finally {
    await driver.setContext(firefox.Context.CONTENT);
  }
  await driver.wait(
    async () => (await driver.getAllWindowHandles()).length > before.length,
    10000,
  );
  const handles = await driver.getAllWindowHandles();
  const added = handles.find((h) => !before.includes(h));
  if (added === undefined) throw new Error('The extension tab did not open');
  await driver.switchTo().window(added);
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
}

function savePng(dir: string, name: string, base64: string): string {
  const file = join(dir, `${name}.png`);
  writeFileSync(file, base64, 'base64');
  return file;
}

const button = (label: string) =>
  By.xpath(`//button[normalize-space()='${label}']`);
const field = (label: string) =>
  By.xpath(`//label[normalize-space()='${label}']/input`);

async function loadDemoAndFindApplication(
  driver: firefox.Driver,
): Promise<string> {
  await openExtensionTab(driver, `${BASE}dashboard.html#/data`);
  await setViewport(driver, 1280, 900);
  const demo = await driver.wait(
    until.elementLocated(button('Load demo data')),
    10000,
  );
  await demo.click();
  await driver.sleep(500);
  await driver.executeScript("location.hash = '#/applications';");
  const link = await driver.wait(
    until.elementLocated(By.css('a[href^="#/applications/"]')),
    10000,
  );
  const href = (await link.getAttribute('href')) ?? '';
  const id = decodeURIComponent(href.slice(href.lastIndexOf('/') + 1));
  if (id === '') throw new Error('Could not read a demo application id');
  return id;
}

async function takeDashboardShot(
  driver: firefox.Driver,
  shot: Shot,
  dir: string,
): Promise<string> {
  const hash = shot.path.slice(shot.path.indexOf('#'));
  await driver.executeScript('location.hash = arguments[0];', hash);
  await setViewport(driver, shot.width, shot.height);
  await driver.sleep(800);
  // The paper grain is a fixed layer the size of the viewport. A full-page
  // capture of a page taller than the viewport would show it stopping at the
  // fold, which never happens while scrolling, so make the viewport as tall as
  // the page first.
  const pageHeight = await driver.executeScript<number>(
    'return document.documentElement.scrollHeight;',
  );
  if (pageHeight > shot.height) {
    await setViewport(driver, shot.width, pageHeight);
  }
  return savePng(dir, shot.name, await driver.takeFullPageScreenshot());
}

async function takePopupShot(
  driver: firefox.Driver,
  shot: Shot,
  dir: string,
): Promise<string> {
  const dashboardHandle = await driver.getWindowHandle();
  await openExtensionTab(driver, `${BASE}${shot.path}`);
  try {
    await setViewport(driver, shot.width, shot.height);
    await driver.wait(
      until.elementLocated(
        By.xpath('//*[contains(., "This page can\'t be read")]'),
      ),
      10000,
    );
    // Headless Firefox will not shrink a window below ~500px wide, so constrain
    // the root to the real popup width (test browser only; nothing in the
    // extension changes). Width is passed as an argument.
    await driver.executeScript(
      `const s = document.documentElement.style;
       s.width = arguments[0] + 'px'; s.maxWidth = arguments[0] + 'px'; s.overflowX = 'visible';`,
      shot.width,
    );
    if (shot.name === 'popup-filed') {
      await driver.findElement(field('Title')).sendKeys('Sample Engineer');
      await driver.findElement(field('Company')).sendKeys('Example Robotics');
      await driver
        .findElement(field('Link'))
        .sendKeys('https://example.com/jobs/1');
      await driver.findElement(button('Save job')).click();
      // Saved: the popup swaps the Save button for the filed state.
      await driver.wait(async () => {
        const buttons = await driver.findElements(button('Save job'));
        return buttons.length === 0;
      }, 10000);
    } else if (shot.name === 'popup-long-url') {
      await driver.findElement(field('Link')).sendKeys(LONG_URL);
    }
    await driver.sleep(300);
    // Measure before the crop below hides any sideways overflow.
    const measured = await driver.executeScript<PopupMeasurement>(
      `const describe = (el) => ({
         tag: el.tagName.toLowerCase(),
         className: typeof el.className === 'string' ? el.className : '',
         scrollWidth: el.scrollWidth,
         clientWidth: el.clientWidth,
       });
       const els = [document.documentElement, document.body, ...document.body.querySelectorAll('*')];
       return { rootWidth: Math.round(document.documentElement.getBoundingClientRect().width), bodyWidth: document.body.clientWidth, elements: els.map(describe) };`,
    );
    const problem = popupProblem(measured, shot.width);
    if (problem !== undefined) throw new Error(`${shot.name}: ${problem}`);
    console.log(
      `${shot.name}: root ${measured.rootWidth}px, body ${measured.bodyWidth}px, no overflow`,
    );
    // Overflow is checked; now clip the height for the element capture.
    await driver.executeScript(
      "const s = document.documentElement.style; s.height = '600px'; s.overflow = 'hidden';",
    );
    const png = await driver.findElement(By.css('html')).takeScreenshot();
    return savePng(dir, shot.name, png);
  } finally {
    await driver.close();
    await driver.switchTo().window(dashboardHandle);
  }
}

async function runTheme(
  binary: string,
  theme: Theme,
  stamp: Date,
): Promise<string[]> {
  const dir = outputDir(ROOT, stamp, theme);
  mkdirSync(dir, { recursive: true });
  const driver = await startSession(binary, theme);
  const files: string[] = [];
  try {
    const applicationId = await loadDemoAndFindApplication(driver);
    for (const shot of shotPlan({ applicationId })) {
      const file = shot.name.startsWith('popup-')
        ? await takePopupShot(driver, shot, dir)
        : await takeDashboardShot(driver, shot, dir);
      files.push(file);
      console.log(`[${theme}] ${file}`);
    }
  } finally {
    await driver.quit().catch(() => undefined);
  }
  return files;
}

async function main(): Promise<void> {
  // Release keys never reach Selenium Manager, geckodriver or Firefox.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('WEB_EXT_')) delete process.env[key];
  }
  // Selenium Manager: don't send usage stats.
  process.env.SE_AVOID_STATS = 'true';
  const binary = resolveBinary();
  if (!existsSync(join(EXT_DIR, 'manifest.json'))) {
    throw new Error(
      `Missing ${join(EXT_DIR, 'manifest.json')}. Run npm run build first.`,
    );
  }
  const stamp = new Date();
  let total = 0;
  for (const theme of ['day', 'night'] as const) {
    total += (await runTheme(binary, theme, stamp)).length;
  }
  console.log(`Saved ${total} screenshots under ${join(ROOT, '.shots')}`);
}

main().catch((err: unknown) => {
  console.error(
    `shots failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
