import { db } from '@/lib/db';
import { translateToLocalesBatch } from '../util/openai';
import { locales, AppLocale } from '@/lib/locale';
import slugify from 'slugify';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

type RegionNode = {
  parent: string;
  children: (string | RegionNode)[];
};

const hierarchy: RegionNode[] = [
  {
    parent: 'Africa',
    children: [
      {
        parent: 'Central Africa',
        children: [
          'Angola',
          'Cameroon',
          'Central African Republic',
          'Chad',
          'Congo (Brazzaville)',
          'Congo Democratic Republic (Kinshasa)',
          'Equatorial Guinea',
          'Gabon',
          'Sao Tome and Principe',
        ],
      },
      {
        parent: 'East Africa',
        children: [
          'Burundi',
          'Comoros',
          'Djibouti',
          'Eritrea',
          'Ethiopia',
          'Kenya',
          'Madagascar',
          'Malawi',
          'Mauritius',
          'Mozambique',
          'Reunion',
          'Rwanda',
          'Seychelles',
          'Somalia',
          'Somaliland',
          'Tanzania',
          'Uganda',
          'Zambia',
          'Zimbabwe',
        ],
      },
      {
        parent: 'North Africa',
        children: [
          'Algeria',
          'Libya',
          'Morocco',
          'South Sudan',
          'Sudan',
          'Tunisia',
          'Western Sahara',
        ],
      },
      {
        parent: 'Southern Africa',
        children: [
          'Botswana',
          'Lesotho',
          'Namibia',
          'South Africa',
          'Swaziland',
        ],
      },
      {
        parent: 'West Africa',
        children: [
          'Benin',
          'Burkina Faso',
          'Cape Verde',
          "Côte D'ivoire",
          'Gambia',
          'Ghana',
          'Guinea',
          'Guinea-Bissau',
          'Liberia',
          'Mali',
          'Mauritania',
          'Niger',
          'Nigeria',
          'Saint Helena',
          'Senegal',
          'Sierra Leone',
          'Togo',
        ],
      },
    ],
  },
  {
    parent: 'America',
    children: [
      {
        parent: 'Central America & Caribbean',
        children: [
          'Anguilla',
          'Antigua and Barbuda',
          'Aruba',
          'Bahamas',
          'Barbados',
          'Belize',
          'Bermuda',
          'Cayman Islands',
          'Costa Rica',
          'Cuba',
          'Curaçao',
          'Dominica',
          'Dominican Republic',
          'El Salvador',
          'Grenada',
          'Guadeloupe',
          'Guatemala',
          'Haiti',
          'Honduras',
          'Jamaica',
          'Martinique',
          'Montserrat',
          'Netherlands Antilles',
          'Nicaragua',
          'Panama',
          'Puerto Rico',
          'Saint Kitts and Nevis',
          'Saint Lucia',
          'Saint Maarten',
          'Saint Vincent and the Grenadines',
          'Trinidad and Tobago',
          'Turks and Caicos Islands',
          'Virgin Islands (British)',
          'Virgin Islands (U.S.)',
        ],
      },
      {
        parent: 'North America',
        children: ['Canada', 'Mexico', 'United States'],
      },
      {
        parent: 'South America',
        children: [
          'Argentina',
          'Bolivia',
          'Brazil',
          'Chile',
          'Colombia',
          'Ecuador',
          'French Guiana',
          'Guyana',
          'Paraguay',
          'Peru',
          'Suriname',
          'Uruguay',
          'Venezuela',
        ],
      },
    ],
  },
  {
    parent: 'Asia',
    children: [
      {
        parent: 'Central & Western Asia',
        children: [
          'Afghanistan',
          'Armenia',
          'Azerbaijan',
          'Georgia',
          'Kazakhstan',
          'Kyrgyzstan',
          'Mongolia',
          'Tajikistan',
          'Turkmenistan',
          'Uzbekistan',
        ],
      },
      {
        parent: 'East Asia',
        children: [
          'China',
          'Hong Kong',
          'Japan',
          'Macau',
          'North Korea',
          'South Korea',
          'Taiwan',
          'Tibet',
        ],
      },
      {
        parent: 'South Asia',
        children: [
          'Bangladesh',
          'Bhutan',
          'India',
          'Maldives',
          'Nepal',
          'Pakistan',
          'Sri Lanka',
        ],
      },
      {
        parent: 'Southeast Asia',
        children: [
          'Brunei',
          'Cambodia',
          'East Timor',
          'Indonesia',
          'Laos',
          'Malaysia',
          'Myanmar (Burma)',
          'Philippines',
          'Singapore',
          'Thailand',
          'Vietnam',
        ],
      },
      {
        parent: 'Middle East',
        children: [
          'Egypt',
          'Bahrain',
          'Iran',
          'Iraq',
          'Jordan',
          'Kuwait',
          'Lebanon',
          'Oman',
          'Palestine',
          'Qatar',
          'Saudi Arabia',
          'Syria',
          'Turkey',
          'United Arab Emirates',
          'Yemen',
        ],
      },
    ],
  },
  {
    parent: 'The Pacific',
    children: [
      'Australia',
      'Cook Islands',
      'Fiji',
      'Guam',
      'Kiribati',
      'Marshall Islands',
      'Micronesia',
      'Nauru',
      'New Caledonia',
      'New Zealand',
      'Niue',
      'Northern Mariana Islands',
      'Palau',
      'Papua New Guinea',
      'Pitcairn',
      'Samoa',
      'Solomon Islands',
      'Tahiti',
      'Tonga',
      'Tuvalu',
      'Vanuatu',
    ],
  },
  {
    parent: 'Europe',
    children: [
      {
        parent: 'Central & Eastern Europe',
        children: [
          'Albania',
          'Belarus',
          'Bosnia and Herzegovina',
          'Bulgaria',
          'Croatia',
          'Cyprus',
          'Cyprus (North)',
          'Czech Republic',
          'Estonia',
          'Hungary',
          'Latvia',
          'Lithuania',
          'Macedonia',
          'Moldova',
          'Montenegro',
          'Poland',
          'Romania',
          'Russia',
          'Serbia',
          'Slovakia',
          'Slovenia',
          'Ukraine',
        ],
      },
      {
        parent: 'Western Europe',
        children: [
          'Andorra',
          'Austria',
          'Belgium',
          'Denmark',
          'Finland',
          'France',
          'Germany',
          'Greece',
          'Iceland',
          'Ireland',
          'Italy',
          'Liechtenstein',
          'Luxembourg',
          'Malta',
          'Monaco',
          'Netherlands',
          'Norway',
          'Portugal',
          'San Marino',
          'Scotland',
          'Spain',
          'Sweden',
          'Switzerland',
          'United Kingdom',
          'Vatican',
          'Wales',
        ],
      },
    ],
  },
];

const main = async () => {
  console.log('Fetching existing regions from database...');
  const existingRegions = await db.region.findMany({
    select: {
      id: true,
      slug: true,
      numberOfAuthors: true,
      numberOfBooks: true,
      nameTranslations: {
        select: { locale: true, text: true },
      },
    },
  });
  console.log(`Found ${existingRegions.length} existing regions`);

  const regionByEnglishName = new Map<string, (typeof existingRegions)[number]>();
  for (const region of existingRegions) {
    const en = region.nameTranslations.find(t => t.locale === 'en');
    if (en) regionByEnglishName.set(en.text, region);
  }

  const existingSlugs = new Set(existingRegions.map(r => r.slug));

  const generateUniqueSlug = (name: string) => {
    let slug = slugify(name, { lower: true, trim: true });
    let suffix = 1;
    while (existingSlugs.has(slug)) {
      slug = slugify(`${name}-${suffix++}`, { lower: true, trim: true });
    }
    existingSlugs.add(slug);
    return slug;
  };

  // Compute summed counts for a node from its (leaf) children
  const computeCounts = (
    node: RegionNode,
  ): { authors: number; books: number } => {
    let totalAuthors = 0;
    let totalBooks = 0;

    for (const child of node.children) {
      if (typeof child === 'string') {
        const existing = regionByEnglishName.get(child);
        if (existing) {
          totalAuthors += existing.numberOfAuthors;
          totalBooks += existing.numberOfBooks;
        }
      } else {
        const sub = computeCounts(child);
        totalAuthors += sub.authors;
        totalBooks += sub.books;
      }
    }

    return { authors: totalAuthors, books: totalBooks };
  };

  // Plan phase: collect all operations
  const parentsToCreate: {
    name: string;
    slug: string;
    authors: number;
    books: number;
  }[] = [];
  const parentIdUpdates: { childId: string; childName: string; parentSlug: string }[] = [];
  const missingChildren: string[] = [];

  // Pre-generate slugs for parents so we can reference them in parentId updates
  const parentSlugMap = new Map<string, string>();

  const planNode = (node: RegionNode, parentName: string | null) => {
    const counts = computeCounts(node);
    const existing = regionByEnglishName.get(node.parent);

    let thisSlug: string;
    if (existing) {
      thisSlug = existing.slug;
    } else {
      thisSlug = parentSlugMap.get(node.parent) ?? generateUniqueSlug(node.parent);
      parentsToCreate.push({
        name: node.parent,
        slug: thisSlug,
        authors: counts.authors,
        books: counts.books,
      });
    }
    parentSlugMap.set(node.parent, thisSlug);

    // If this node has a parent, schedule a parentId update for it
    if (parentName) {
      const parentSlug = parentSlugMap.get(parentName);
      if (parentSlug) {
        const id = existing?.id ?? thisSlug;
        parentIdUpdates.push({
          childId: id,
          childName: node.parent,
          parentSlug,
        });
      }
    }

    for (const child of node.children) {
      if (typeof child === 'string') {
        const childRegion = regionByEnglishName.get(child);
        if (childRegion) {
          parentIdUpdates.push({
            childId: childRegion.id,
            childName: child,
            parentSlug: thisSlug,
          });
        } else {
          missingChildren.push(child);
        }
      } else {
        planNode(child, node.parent);
      }
    }
  };

  for (const node of hierarchy) {
    planNode(node, null);
  }

  // Print plan
  console.log('\n=== Plan ===');
  console.log(`\nParent regions to CREATE (${parentsToCreate.length}):`);
  for (const p of parentsToCreate) {
    console.log(
      `  + ${p.name} (slug: ${p.slug}, authors: ${p.authors}, books: ${p.books})`,
    );
  }

  console.log(`\nparentId updates to apply (${parentIdUpdates.length}):`);
  for (const u of parentIdUpdates) {
    console.log(`  "${u.childName}" (${u.childId}) -> parentId = "${u.parentSlug}"`);
  }

  if (missingChildren.length > 0) {
    console.log(`\nWarning: ${missingChildren.length} children not found in DB:`);
    for (const name of missingChildren) {
      console.log(`  - ${name}`);
    }
  }

  const rl = createInterface({ input, output });
  const answer = await rl.question('\nProceed? (y/N) ');
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Aborted.');
    process.exit(0);
  }

  // Execute: create parent regions
  console.log('\nCreating parent regions...');
  const localeCodes = locales.map(l => l.code) as AppLocale[];

  for (const p of parentsToCreate) {
    console.log(`\n  Translating "${p.name}"...`);
    const translations = await translateToLocalesBatch('region', p.name, localeCodes);

    if (!translations.has('en')) {
      translations.set('en', { translation: p.name, transliteration: '' });
    }

    const arabicData = translations.get('ar');
    const transliteration = arabicData?.transliteration || '';

    const translationData = Array.from(translations.entries()).map(
      ([locale, { translation }]) => ({ locale, text: translation }),
    );

    try {
      await db.region.create({
        data: {
          id: p.slug,
          slug: p.slug,
          transliteration,
          numberOfAuthors: p.authors,
          numberOfBooks: p.books,
          nameTranslations: {
            createMany: { data: translationData },
          },
        },
      });

      const list = Array.from(translations.entries())
        .map(([l, { translation }]) => `${l}: ${translation}`)
        .join(', ');
      console.log(`  Created "${p.name}" -> ${p.slug} [${list}]`);
    } catch (e) {
      console.error(`  Failed to create "${p.name}":`, e);
    }
  }

  // Execute: set parentIds
  console.log('\nSetting parentIds...');
  for (const u of parentIdUpdates) {
    try {
      await db.region.update({
        where: { id: u.childId },
        data: { parentId: u.parentSlug },
      });
      console.log(`  ${u.childName} -> parentId = ${u.parentSlug}`);
    } catch (e) {
      console.error(`  Failed to set parentId for "${u.childName}" (${u.childId}):`, e);
    }
  }

  console.log('\nDone!');
};

main()
  .catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
