import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: ['getting-started/quick-start', 'getting-started/wallets'],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/zero-coupon-notes',
        'concepts/maturities',
        'concepts/rates-and-prices',
        'concepts/order-book',
        'concepts/collateral-and-health',
        'concepts/liquidation',
        'concepts/bad-debt',
        'concepts/oracle',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/deposit',
        'guides/lend',
        'guides/borrow',
        'guides/manage-loan',
        'guides/exit-early',
        'guides/redeem',
        'guides/withdraw',
        'guides/portfolio',
      ],
    },
    {
      type: 'category',
      label: 'How it works',
      items: [
        'how-it-works/architecture',
        'how-it-works/near-intents',
        'how-it-works/money-flows',
        'how-it-works/backend-services',
        'how-it-works/trust-model',
        'how-it-works/risks',
      ],
    },
    {
      type: 'category',
      label: 'Developers',
      items: [
        {
          type: 'category',
          label: 'Contract reference',
          items: [
            'developers/contract/overview',
            'developers/contract/messages',
            'developers/contract/auth-call',
            'developers/contract/matching',
            'developers/contract/views',
            'developers/contract/events',
            'developers/contract/owner',
            'developers/contract/math',
            'developers/contract/errors',
            'developers/contract/gas',
          ],
        },
        'developers/signing-intents',
        'developers/rest-api',
        'developers/websocket-api',
        'developers/asset-ids',
      ],
    },
    {
      type: 'category',
      label: 'Verify and try',
      items: ['verify/verify-contract', 'verify/simulation', 'verify/run-locally'],
    },
    {
      type: 'category',
      label: 'Reference',
      items: ['reference/risk-parameters', 'reference/glossary', 'reference/faq'],
    },
    'changelog',
  ],
};

export default sidebars;
