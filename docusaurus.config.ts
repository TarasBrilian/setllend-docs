import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Setllend Docs',
  tagline: 'Fixed-rate lending and borrowing, settled on NEAR Intents',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://docs.setllend.xyz',
  baseUrl: '/',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  markdown: {
    // .md files are CommonMark, .mdx files are MDX (calculators, tabs).
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  headTags: [
    {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.googleapis.com'}},
    {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous'}},
    {
      tagName: 'link',
      attributes: {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap',
      },
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: undefined,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Setllend',
      logo: {
        alt: 'Setllend',
        src: 'img/logo.svg',
        href: '/',
      },
      items: [
        {type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs'},
        {to: '/developers/contract/overview', label: 'Developers', position: 'left'},
        {to: '/changelog', label: 'Changelog', position: 'left'},
        {href: 'https://www.setllend.xyz', label: 'Open app', position: 'right'},
        {href: 'https://github.com/TarasBrilian/setllend', label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Product',
          items: [
            {label: 'App', href: 'https://www.setllend.xyz'},
            {label: 'Quick start', to: '/getting-started/quick-start'},
          ],
        },
        {
          title: 'Developers',
          items: [
            {label: 'Contract reference', to: '/developers/contract/overview'},
            {label: 'REST API', to: '/developers/rest-api'},
            {label: 'Source code', href: 'https://github.com/TarasBrilian/setllend'},
          ],
        },
        {
          title: 'On chain',
          items: [
            {label: 'setllend.near', href: 'https://nearblocks.io/address/setllend.near'},
            {label: 'Verify the contract', to: '/verify/verify-contract'},
          ],
        },
      ],
      copyright: `Setllend · MIT License`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['rust', 'bash', 'json', 'toml'],
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
