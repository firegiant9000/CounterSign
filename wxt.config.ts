import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  imports: false,
  vite: () => ({ plugins: [preact()], build: { modulePreload: false } }),
  manifest: ({ command }) => ({
    name: 'Countersign',
    description:
      'A local-only job search companion. Nothing runs until you click, and nothing leaves your machine.',
    permissions: ['unlimitedStorage'],
    action: { default_title: 'Countersign', default_icon: 'icon.svg' },
    icons: { 48: 'icon.svg', 96: 'icon.svg' },
    browser_specific_settings: {
      gecko: {
        id: 'countersign@firegiant9000',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
    ...(command === 'build'
      ? {
          content_security_policy: {
            extension_pages:
              "default-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
          },
        }
      : {}),
  }),
});
