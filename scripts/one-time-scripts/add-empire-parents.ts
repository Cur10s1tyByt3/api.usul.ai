import { db } from '@/lib/db';
import { translateToLocalesBatch } from '../util/openai';
import { locales, AppLocale } from '@/lib/locale';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

type EmpireNode = {
    parent: string;
    children: (string | EmpireNode)[];
};

const hierarchy: EmpireNode[] = [
    {
        parent: 'early-islamic-rule-(arabia-iraq-persia)',
        children: [
            'prophet-muammad\'s-time',
            'the-sunni-rightly-guided-4-caliphs-(al-khulafa-al-rashidun)',
            'the-12-shii-imams',
        ],
    },
    {
        parent: 'umayyads',
        children: [
            'umayyad-east-(iraq-syria-arabian-peninsula)',
            'umayyad-west-(iberian-peninsula-except-the-north)',
        ],
    },
    {
        parent: 'abbasids',
        children: [
            'caliphs-in-iraq',
            'caliphs-in-cairo',
            {
                parent: 'sultans-in-egypt-and-syria',
                children: [
                    'ulunids-(egypt-syria)',
                    'ikhshidids-(egypt-s-syria)',
                    'faimids-(n-africa-egypt-s-syria)',
                    'mirdasids-(n-and-central-syria)',
                    'nizari-ismailis-(w-syria)',
                    'ayyubids-(egypt-syria-diyar-bakr-w-jazira-yemen)',
                    'mamluks-(egypt-syria)',
                ],
            },
        ],
    },
    {
        parent: 'subsequent-empires-and-eras-by-region',
        children: [
            {
                parent: 'north-africa-and-iberian-peninsula',
                children: [
                    'idrisids-(morocco)',
                    'rustamids-(algeria)',
                    'midrarids-(morocco)',
                    'aghlabids-(ifriqiya-algeria-sicily)',
                    'the-kalbids-(sicily)',
                    'zirids-and-hammadids-(tunisia-e-algeria)',
                    'almoravids-or-al-murabiun-(nw-africa-spain)',
                    'almohads-or-al-muwaiddun-(n-africa-spain)',
                    'muluk-al-awaifreyes-de-taifas-(central-and-southern-spain)',
                    'banu-ghaniya-(balearic-islands)',
                    'nasrids-or-banu-al-amar-(granada)',
                    'marinids-(n-africa)',
                    'abd-al-wadids-or-zayyanids-(algeria)',
                    'hafsids-(tunisia-algeria)',
                    'wattasids-(morocco-central-maghrib)',
                    'sadid-sharifs-(morocco)',
                    'alawid-or-filali-sharifs-(morocco)',
                    'husaynid-beys-(tunisia)',
                    'the-qaramanlis-(tripolitania)',
                    'sanusi-chiefs-an-rulers-(sudan-libya)',
                ],
            },
            {
                parent: 'iraq-jazira-lebanon',
                children: [
                    'hamdanids-(jazira-n.-syria)',
                    'mazyadids-(illa-central-iraq)',
                    'marwanids-(diyar-bakr)',
                    'the-uqaylids-(iraq-jazira-n-syria)',
                    'numayrids-(arran-saruj-qalat-jabar-raqqa)',
                    'man-amirs-(s-lebanon)',
                    'shihab-amirs-(lebanon)',
                ],
            },
            {
                parent: 'arabian-peninsula',
                children: [
                    'carmathian-(qarmai)-rulers-(syria-iraq-e-arabia)',
                    'zaydi-imams-(yemen:-sada-sana)',
                    'ziyadids-(yemen:-zabid)',
                    'yufirids-(yemen:-sana-janad)',
                    'najahids-(yemen:-zabid)',
                    'sulayhids-(yemen:-sana-dhu-jibla)',
                    'zurayids-or-banu-l-karam-(s-yemen:-aden)',
                    'hamdanids-(n-yemen:-sana)',
                    'mahdids-(yemen:-zabid)',
                    'rasulids-(s-yemen-tihama:-taizz)',
                    'ahirds-(s-yemen-tihama:-al-miqrana-juban)',
                    'al-al-julanda-(oman)',
                    'mukramids-(coastal-oman)',
                    'yarubids-(oman:-rustaq)',
                    'al-bu-said-(oman:-muscat-zanzibar)',
                    'al-saud-(najd-ijaz-modern-saudi-arabia)',
                    'hashimite-sharifs-(mecca-ijaz-fertile-crescent)',
                    'al-rashid-(n-najd)',
                ],
            },
            {
                parent: 'west-africa',
                children: [
                    'keita-kings-(mali-n-guinea-gambia-senegal)',
                    'kings-of-songhay-(mali:-savannah-zone)',
                    'rulers-of-kanem-and-bornu-(e-central-sudan)',
                    'fulani-rulers-in-hausaland-sokoto-(n-nigeria-niger-valley)',
                ],
            },
            {
                parent: 'east-africa-and-horn-of-africa',
                children: [
                    'sultans-of-kilwa-(tanzanian-coastland)',
                    'nabhani-rulers-of-pate-(island-of-pate-modern-kenyan-coastland)',
                    'mazrui-liwalis-of-mombasa-(mobasa-pemba-island)',
                    'al-bu-said-(zanzibar-and-e-africa-coastland)',
                    'sultans-of-harar-(se-ethiopia)',
                ],
            },
            {
                parent: 'western-persia-central-asia-and-the-fertile-crescent',
                children: [
                    'sharwan-shahs-(e-transcaucasia:-yazidiyya)',
                    'hashimids-(bab-abwabdarband-and-its-hinterland)',
                    'justanids-(daylam:-rudbar-shah-rud-valleys)',
                    'sajids-(azerbaijan)',
                    'musafirids-or-sallarids-(daylam:-arum-and-samiran-azerbaijan-arran)',
                    'rawwadids-(azerbaijan:-tabriz)',
                    'shaddadids-(arran-e.-armenia)',
                    'dulafids-(central-jibal:-karaj)',
                    'buyids-or-buwayhids-(n-w-s-persia-iraq)',
                    'asanuyids-or-asanawayhid-(s-kurdistan)',
                    'annazids-(s-kurdistan-luristan)',
                    'kakuyids-or-kakawayhids-(jibal-and-kurdistan)',
                    'dabuyid-ispahbadhs-(gilan-ruyan-abaristan-coastlands:-sari)',
                    'bawandid-ispahbadhs-(abaristan-gilan-highlands)',
                    'ziyarids-(abaristan-gurgan)',
                    'seljuqs-(persia-iraq-syria)',
                    'borids-or-burids-(damascus-s-syria)',
                    'zangids-(jazira-and-syria)',
                    'begtiginids-(ne-iraq-kurdistan:-irbil-n-syria:-arran)',
                    'luluids-(mosul-and-jazira)',
                    'artuqids-(diyar-bakr)',
                    'shah-i-armanids-(e-anatolia:-akhla)',
                    'amadilis-(azerbaijan:-maragha-ruin-diz)',
                    'eldiguzids-or-ildegizids-(azerbaijan-arran-n-jibal)',
                    'baduspanis-(caspian-coastlands:-ruyan-rustamdar)',
                    'nizari-ismailis-in-persia-(persian-mountainous-regions-alamut)',
                    'hazaraspids-(luristan)',
                    'salghurids-(fars)',
                    'atabegs-(yazd)',
                    'qutlughkhanids-(kirman)',
                    'maliks-of-nimruz-(sistan)',
                ],
            },
            {
                parent: 'eastern-persia-central-asia-and-the-fertile-crescent',
                children: [
                    'ahirids-and-musabids-(khurasan-iraq:-baghdad)',
                    'samanids-(transoxania-khurasan)',
                    'saffarids-(sistan-persia-e-afghanistan)',
                    'banijurids-or-abu-dawuddids-(balkh-ukharistan)',
                    'simjurids-(khurasan-quhistan)',
                    'ilyasids-(kirman)',
                    'mutajids-(khurasan-chaghaniyan)',
                    'khwarazm-shahs-(khwarazm)',
                    'qarakhanids-(transoxania-farghana-semirechye-e-turkestan)',
                ],
            },
            {
                parent: 'persia:-after-the-mongols',
                children: [
                    'karts-or-kurts-(e-khurasan-n-afghanistan)',
                    'muaffarids-(s-w-persia)',
                    'injuids-(fars)',
                    'jalayrids-(iraq-kurdistan-azerbaijan)',
                    'sarbadarids-(w-khurasan)',
                    'timurids-(transoxania-persia)',
                    'qara-qoyunlu-(e-anatolia-azerbaijan-iraq-w-persia)',
                    'aq-qoyunlu-(diyar-bakr-e-anatolia-azerbaijan-w.-persia-fars-kirman)',
                    'mushashaids-(sw-persia:-arabistan)',
                    'safavids-(persia)',
                    'afsharids-(persia)',
                    'zands-(persia-except-khurasan)',
                    'qajars-(persia)',
                    'pahlavis-(persia)',
                ],
            },
            {
                parent: 'anatolia',
                children: [
                    'seljuqs-of-rum-(w-central-anatolia:-konya-most-of-anatolia)',
                    'danishmendids-(n-central-anatolia-e-anatolia)',
                    'mengujekids-(n-anatolia:-erzincan-divrigi-kemakh)',
                    'saltuqis-(e-anatollia:-erzurum)',
                    'qarasi-or-karasi-oghullari-(sw-anatolia)',
                    'sarukhan-oghullari-(w-anatolia)',
                    'aydin-oghullari-(w-anatolia)',
                    'menteshe-oghullari-(sw-anatolia)',
                    'inanj-oghullari-(sw-anatolia:-denizli)',
                    'germiyan-oghullari-(w-anatolia)',
                    'saib-ata-oghullari-(w-central-anatolia)',
                    'amid-oghullari-and-tekke-oghullari-(w-central-anatolia-sw-coastland)',
                    'beys-of-alanya-(s-anatolia-coastland)',
                    'ashraf-or-eshref-oghullari-(s-central-anatolia)',
                    'jandar-oghullari-or-isfandiyar-oghullari-(black-sea-coastland)',
                    'parwana-oghullari-(black-sea-coast:-sinop)',
                    'choban-oghullari-(kastamonuqasamuni)',
                    'qaraman-oghullari-(s-central-anatolia-mediterranean-coastland)',
                    'eretna-oghullari-(ne-anatolia)',
                    'qai-burhan-al-din-oghullari-(ne-anatolia)',
                    'taj-al-din-oghullari-(black-sea-coast-hinterland:-canikjanik)',
                    'ramaan-oghullari-(cilicia-little-armenia)',
                    'dulghadir-oghullari-or-dhu-l-qadrids-(se-anatolia)',
                    'ottomans-(nw-anatolia-balkans-mena-eritrea)',
                ],
            },
            {
                parent: 'central-asia-far-east-and-eastern-europe',
                children: [
                    'mongols-and-the-later-yuan-dynasty-of-china-(mongolia-china)',
                    'chaghatayids-(transoxania-mogholistan:-semirechye-e-turkestan)',
                    'il-khanids-(persia-iraq-e-and-central-anatolia)',
                    'khans-of-the-golden-horde-(w-siberia-khwarazm-s-russia)',
                    'giray-khans-(crimea-s-ukraine)',
                    'khans-of-astrakhan-(lower-volga-and-adjacent-steppelands)',
                    'khans-of-qazan-(middle-volga)',
                    'khans-of-qasimov-(ryazan-to-se-of-moscow)',
                ],
            },
            {
                parent: 'central-asia-and-afghanistan:-after-the-mongols',
                children: [
                    'shibanids-(or-shaybanids)-or-abu-l-khayrids-(transoxania-n-afghanistan)',
                    'toqay-temurids-or-janids-or-ashtarkhanids-(transoxania-n-afghanistan)',
                    'mangits-(khanate-of-bukhara)',
                    'qungrats-or-inaqids-(khanate-of-khiva)',
                    'mings-(khanate-of-khoqand)',
                ],
            },
            {
                parent: 'indian-subcontinent-and-afghanistan',
                children: [
                    'ghaznavids-(afghanistan-khurasan-baluchistan-nw-india)',
                    'ghurids-(ghur-khurasan-nw-india)',
                    'delhi-sultans-(n-india-n-deccan)',
                    'sultans-of-bengal-(bengal-bihar)',
                    'sultans-of-kashmir-(kashmir)',
                    'sultans-of-gujarat-(w-india)',
                    'sharqi-sultans-of-jawnpur-(e-central-n-india)',
                    'sultans-and-rulers-of-malwa-(central-india)',
                    'sultans-of-mabar-or-madura-(s-deccan)',
                    'bahmanids-(n-deccan)',
                    'faruqi-rulers-of-khandesh-(nw-deccan)',
                    'barid-shahis-(bidar)',
                    'adil-shahis-(bijapur)',
                    'niam-shahis-(amadnagar)',
                    'imad-shahis-(berar)',
                    'qub-shahis-(golconda-muammadnagar)',
                    'arghuns-(multan-and-sind)',
                    'mughal-emperors-(india)',
                    'nawwab-viziers-and-nawwab-naims-(bengal)',
                    'nawwab-viziers-and-kings-of-qudh-(awadh)-(n-india)',
                    'niams-of-hyderabad-(s-india)',
                    'muslim-rulers-in-mysore-(s-india)',
                    'abdali-or-durrani-rulers-and-kings-(afghanistan)',
                ],
            },
            {
                parent: 'se-asia-and-indonesia',
                children: [
                    'rulers-of-malacca-(sw-coast-of-malay-peninsula)',
                    'sultans-of-aceh-(n-sumatra)',
                    'rulers-of-mataram-(central-java)',
                    'susuhanans-of-surakarta-(central-java)',
                    'sultans-of-jogjakarta-(s-central-java)',
                    'sultans-of-brunei-(n-borneo)',
                ],
            },
        ],
    },
];

// Convert a slug to a human-readable name for translation
const slugToReadableName = (slug: string): string => {
    const smallWords = new Set(['and', 'in', 'of', 'the', 'by', 'or', 'an', 'de']);

    return slug
        .replace(/:/g, ': ')
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (match, offset, str) => {
            const word = str.slice(offset).split(/\s/)[0].toLowerCase();
            if (offset === 0) return match.toUpperCase();
            if (smallWords.has(word)) return match.toLowerCase();
            return match.toUpperCase();
        });
};

const main = async () => {
    console.log('Fetching existing empires from database...');
    const existingEmpires = await db.empire.findMany({
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
    console.log(`Found ${existingEmpires.length} existing empires`);

    const empireBySlug = new Map(existingEmpires.map(e => [e.slug, e]));
    const existingSlugs = new Set(existingEmpires.map(e => e.slug));

    // Compute summed counts for a node from its (leaf) children
    const computeCounts = (
        node: EmpireNode,
    ): { authors: number; books: number } => {
        let totalAuthors = 0;
        let totalBooks = 0;

        for (const child of node.children) {
            if (typeof child === 'string') {
                const existing = empireBySlug.get(child);
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

    // Plan phase
    const parentsToCreate: {
        name: string;
        slug: string;
        authors: number;
        books: number;
    }[] = [];
    const parentIdUpdates: {
        childSlug: string;
        parentSlug: string;
    }[] = [];
    const missingChildren: string[] = [];

    const planNode = (node: EmpireNode, parentSlug: string | null) => {
        const counts = computeCounts(node);
        const slug = node.parent;
        const alreadyExists = empireBySlug.has(slug);

        if (!alreadyExists && !parentsToCreate.some(p => p.slug === slug)) {
            parentsToCreate.push({
                name: slugToReadableName(slug),
                slug,
                authors: counts.authors,
                books: counts.books,
            });
        }

        if (parentSlug) {
            parentIdUpdates.push({ childSlug: slug, parentSlug });
        }

        for (const child of node.children) {
            if (typeof child === 'string') {
                if (empireBySlug.has(child)) {
                    parentIdUpdates.push({ childSlug: child, parentSlug: slug });
                } else {
                    missingChildren.push(child);
                }
            } else {
                planNode(child, slug);
            }
        }
    };

    for (const node of hierarchy) {
        planNode(node, null);
    }

    // Print plan
    console.log('\n=== Plan ===');
    console.log(`\nParent empires to CREATE (${parentsToCreate.length}):`);
    for (const p of parentsToCreate) {
        console.log(
            `  + "${p.name}" (slug: ${p.slug}, authors: ${p.authors}, books: ${p.books})`,
        );
    }

    console.log(`\nparentId updates to apply (${parentIdUpdates.length}):`);
    for (const u of parentIdUpdates) {
        console.log(`  ${u.childSlug} -> parentId = "${u.parentSlug}"`);
    }

    if (missingChildren.length > 0) {
        console.log(
            `\nWarning: ${missingChildren.length} children not found in DB:`,
        );
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

    // Execute: create parent empires
    console.log('\nCreating parent empires...');
    const localeCodes = locales.map(l => l.code) as AppLocale[];

    for (const p of parentsToCreate) {
        console.log(`\n  Translating "${p.name}"...`);
        const translations = await translateToLocalesBatch(
            'empire',
            p.name,
            localeCodes,
        );

        if (!translations.has('en')) {
            translations.set('en', { translation: p.name, transliteration: '' });
        }

        const arabicData = translations.get('ar');
        const transliteration = arabicData?.transliteration || '';

        const translationData = Array.from(translations.entries()).map(
            ([locale, { translation }]) => ({ locale, text: translation }),
        );

        try {
            await db.empire.create({
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
            await db.empire.update({
                where: { slug: u.childSlug },
                data: { parentId: u.parentSlug },
            });
            console.log(`  ${u.childSlug} -> parentId = ${u.parentSlug}`);
        } catch (e) {
            console.error(
                `  Failed to set parentId for "${u.childSlug}":`,
                e,
            );
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
