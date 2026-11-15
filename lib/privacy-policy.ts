import { z } from 'zod';
import { Lang } from './types';

// The privacy policy is stored on campaign_settings.privacy_policy (jsonb) and
// edited in /admin/integritetspolicy. Anything not edited falls back to the
// defaults below. `p` holds paragraphs separated by a blank line.
export type PolicySection = { h: string; p: string };
export type PolicyLang = { updated: string; sections: PolicySection[] };
export type Controller = { name: string; orgNumber: string; address: string; email: string; phone: string };
export type PrivacyStored = { controller?: Partial<Controller>; langs?: Partial<Record<Lang, PolicyLang>> };

export const EMPTY_CONTROLLER: Controller = { name: '', orgNumber: '', address: '', email: '', phone: '' };

const line = z.string().trim().max(200);
const policyLang = z.object({
  updated: z.string().trim().max(100),
  sections: z.array(z.object({ h: z.string().trim().min(1, 'Varje avsnitt behöver en rubrik.').max(150), p: z.string().trim().max(4000, 'Max 4000 tecken per avsnitt.') }).strict()).max(25)
}).strict();
export const privacySchema = z.object({
  controller: z.object({ name: line, orgNumber: line, address: line, email: line.refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Ogiltig e-postadress.'), phone: line }).strict(),
  langs: z.object({ en: policyLang.optional(), sv: policyLang.optional(), ar: policyLang.optional() }).strict()
}).strict();

export const CONTROLLER_LABELS: Record<Lang, { title: string; name: string; orgNumber: string; address: string; email: string; phone: string }> = {
  en: { title: 'Data controller', name: 'Association', orgNumber: 'Organisation number', address: 'Address', email: 'Email', phone: 'Phone' },
  sv: { title: 'Personuppgiftsansvarig', name: 'Förening', orgNumber: 'Organisationsnummer', address: 'Adress', email: 'E-post', phone: 'Telefon' },
  ar: { title: 'الجهة المسؤولة عن البيانات', name: 'الجمعية', orgNumber: 'الرقم التنظيمي', address: 'العنوان', email: 'البريد الإلكتروني', phone: 'الهاتف' }
};

export const POLICY_DEFAULTS: Record<Lang, PolicyLang> = {
  en: {
    updated: 'Last updated: November 2026',
    sections: [
      { h: 'Who is responsible', p: 'Al-Rahma Mosque in Borlänge, Sweden is the controller of the personal data described here. Our details are shown above.' },
      { h: 'What we store and why', p: 'If you register a one-time gift or a monthly plan we store: your name, email address, phone number (if you give it), the amount and plan, how you want to be contacted, the payment reference, and the choices and consents you tick. We also keep a log of when you gave consent so we can show that it was given.\n\nWe use this to match your payment to your pledge, to send the reminders you asked for, and to report to the board.\n\nName, email and amount are required: without them we cannot register your pledge. Phone is required only if you choose SMS or WhatsApp contact. Everything else is optional.' },
      { h: 'Legal grounds', p: 'Matching your payments to your pledge and keeping accurate records: performance of the agreement you make with us when you register a pledge (GDPR Art. 6(1)(b)), or our legitimate interest in accurate records (Art. 6(1)(f)). Reminders and other messages you opt in to, and showing your name publicly: your consent (Art. 6(1)(a)). Accounting records: a legal obligation (Art. 6(1)(c)).' },
      { h: 'Religious belief', p: 'Because a gift to a mosque can reveal religious belief, which is a special category of data, we process this data with your explicit consent (Art. 9(2)(a)) or, for members and regular supporters, as a non-profit religious organisation (Art. 9(2)(d)).' },
      { h: 'The public donations list', p: 'By default you appear as “Anonymous Supporter”. Your chosen display name is shown on the public list only if you explicitly tick the box for it. Your email, phone number and other details are never shown publicly. You can ask us to change or remove your display name at any time.' },
      { h: 'Swish and bank payments', p: 'The payment itself is made in Swish or your bank, not on this website. When a payment arrives, the payment provider may give us the payer’s name and phone number or account details. We use them only to match the payment to your pledge and for bookkeeping. They are not shown on the public list.' },
      { h: 'How long we keep it', p: 'Registration details are deleted within 12 months after the campaign ends. Payment records that are part of our accounts are kept for seven years after the end of the calendar year in which the financial year ended, as required by the Swedish Bookkeeping Act, where we are required to keep accounts. You can ask us to erase other data earlier.' },
      { h: 'Who receives it', p: 'Only the mosque board members who administer donations. We use service providers to run the site: hosting, the database, and, only if you chose it, email, SMS or WhatsApp delivery. They process data on our behalf under a data processing agreement (GDPR Art. 28).' },
      { h: 'Transfers outside the EU/EEA', p: 'If a provider stores or accesses data outside the EU/EEA (for example in the USA), the transfer is protected by a safeguard required by GDPR, such as the EU–US Data Privacy Framework or standard contractual clauses. Contact us for details.' },
      { h: 'No automated decisions', p: 'We do not use automated decision-making or profiling.' },
      { h: 'Cookies', p: 'This public site does not use advertising or analytics cookies. It stores your language choice in your browser (local storage), which is needed for the site to work the way you chose. No cookie banner is needed for this.' },
      { h: 'Your rights', p: 'You have the right to access, correct and erase your data, to restrict or object to processing, to receive a copy of your data, and to withdraw consent at any time. Withdrawing consent does not affect processing that took place before. Contact us to use these rights.\n\nYou can also complain to the Swedish Authority for Privacy Protection (IMY), imy.se.' }
    ]
  },
  sv: {
    updated: 'Senast uppdaterad: november 2026',
    sections: [
      { h: 'Vem ansvarar', p: 'Al-Rahma-moskén i Borlänge är personuppgiftsansvarig för de uppgifter som beskrivs här. Våra uppgifter visas ovan.' },
      { h: 'Vad vi sparar och varför', p: 'Om du registrerar en engångsgåva eller en månadsplan sparar vi: ditt namn, din e-postadress, ditt telefonnummer (om du anger det), belopp och plan, hur du vill bli kontaktad, betalningsreferensen samt de val och samtycken du kryssar i. Vi sparar också en logg över när du lämnade samtycke så att vi kan visa att det getts.\n\nVi använder uppgifterna för att koppla din betalning till ditt åtagande, skicka de påminnelser du bett om och redovisa till styrelsen.\n\nNamn, e-post och belopp är obligatoriska: utan dem kan vi inte registrera ditt åtagande. Telefonnummer krävs bara om du väljer SMS- eller WhatsApp-kontakt. Allt annat är frivilligt.' },
      { h: 'Rättslig grund', p: 'Att koppla dina betalningar till ditt åtagande och föra korrekta register: fullgörande av det avtal du ingår med oss när du registrerar ett åtagande (GDPR art. 6.1 b), eller vårt berättigade intresse av korrekta register (art. 6.1 f). Påminnelser och andra meddelanden du valt, samt visning av ditt namn offentligt: ditt samtycke (art. 6.1 a). Bokföring: rättslig förpliktelse (art. 6.1 c).' },
      { h: 'Religiös övertygelse', p: 'Eftersom en gåva till en moské kan avslöja religiös övertygelse, som är en särskild kategori av personuppgifter, behandlar vi uppgifterna med ditt uttryckliga samtycke (art. 9.2 a) eller, för medlemmar och återkommande givare, som en ideell organisation med religiöst syfte (art. 9.2 d).' },
      { h: 'Den offentliga donationslistan', p: 'Som standard visas du som ”Anonym givare”. Ditt valda visningsnamn visas på den offentliga listan endast om du uttryckligen kryssar i rutan för det. Din e-post, ditt telefonnummer och andra uppgifter visas aldrig offentligt. Du kan när som helst be oss ändra eller ta bort ditt visningsnamn.' },
      { h: 'Swish och banköverföringar', p: 'Själva betalningen sker i Swish eller din bank, inte på den här webbplatsen. När en betalning kommer in kan betalningsleverantören ge oss betalarens namn och telefonnummer eller kontouppgifter. Vi använder dem bara för att koppla betalningen till ditt åtagande och för bokföring. De visas inte på den offentliga listan.' },
      { h: 'Hur länge vi sparar', p: 'Registreringsuppgifter raderas inom 12 månader efter att insamlingen avslutats. Betalningsunderlag som ingår i bokföringen sparas i sju år efter utgången av det kalenderår då räkenskapsåret avslutades, enligt bokföringslagen, om vi är bokföringsskyldiga. Du kan be oss radera övriga uppgifter tidigare.' },
      { h: 'Vem som får uppgifterna', p: 'Endast de styrelsemedlemmar som administrerar donationer. Vi använder tjänsteleverantörer för att driva webbplatsen: drift, databas och, bara om du valt det, e-post, SMS eller WhatsApp. De behandlar uppgifter för vår räkning enligt personuppgiftsbiträdesavtal (GDPR art. 28).' },
      { h: 'Överföring utanför EU/EES', p: 'Om en leverantör lagrar eller har åtkomst till uppgifter utanför EU/EES (till exempel i USA) skyddas överföringen av en skyddsåtgärd enligt GDPR, såsom EU–US Data Privacy Framework eller standardavtalsklausuler. Kontakta oss för mer information.' },
      { h: 'Inga automatiserade beslut', p: 'Vi använder inte automatiserat beslutsfattande eller profilering.' },
      { h: 'Kakor', p: 'Den här publika webbplatsen använder inga reklam- eller analyskakor. Ditt språkval sparas i din webbläsare (lokal lagring), vilket behövs för att sidan ska fungera som du valt. Ingen kakbanner behövs för detta.' },
      { h: 'Dina rättigheter', p: 'Du har rätt till tillgång, rättelse och radering, att begränsa eller invända mot behandling, att få en kopia av dina uppgifter och att när som helst återkalla samtycke. Återkallat samtycke påverkar inte behandling som skett tidigare. Kontakta oss för att använda dina rättigheter.\n\nDu kan också klaga till Integritetsskyddsmyndigheten (IMY), imy.se.' }
    ]
  },
  ar: {
    updated: 'آخر تحديث: نوفمبر 2026',
    sections: [
      { h: 'الجهة المسؤولة', p: 'مسجد الرحمة في بورلنج بالسويد هو المسؤول عن معالجة البيانات الشخصية الموضحة هنا. بياناتنا مذكورة أعلاه.' },
      { h: 'ما نخزّنه ولماذا', p: 'عند تسجيل تبرع لمرة واحدة أو خطة شهرية نخزّن: اسمك وبريدك الإلكتروني ورقم هاتفك (إن أدخلته) والمبلغ والخطة وطريقة التواصل المفضلة ومرجع الدفع وخياراتك وموافقاتك. ونحتفظ أيضًا بسجل لوقت موافقتك لنتمكن من إثبات أنها أُعطيت.\n\nنستخدم هذه البيانات لمطابقة دفعتك مع التزامك وإرسال التذكيرات التي طلبتها وإعداد التقارير لمجلس الإدارة.\n\nالاسم والبريد الإلكتروني والمبلغ حقول إلزامية: بدونها لا نستطيع تسجيل التزامك. رقم الهاتف مطلوب فقط إذا اخترت التواصل عبر الرسائل النصية أو واتساب. وكل ما عدا ذلك اختياري.' },
      { h: 'الأساس القانوني', p: 'مطابقة دفعاتك مع التزامك وحفظ سجلات دقيقة: تنفيذ الاتفاق الذي تبرمه معنا عند تسجيل التزامك (المادة 6(1)(ب) من GDPR)، أو مصلحتنا المشروعة في سجلات دقيقة (المادة 6(1)(و)). التذكيرات والرسائل التي اخترتها، وعرض اسمك علنًا: موافقتك (المادة 6(1)(أ)). السجلات المحاسبية: التزام قانوني (المادة 6(1)(ج)).' },
      { h: 'المعتقد الديني', p: 'لأن التبرع لمسجد قد يكشف المعتقد الديني، وهو فئة خاصة من البيانات، فإننا نعالج هذه البيانات بموافقتك الصريحة (المادة 9(2)(أ)) أو، بالنسبة للأعضاء والداعمين المنتظمين، بصفتنا منظمة دينية غير ربحية (المادة 9(2)(د)).' },
      { h: 'قائمة التبرعات العلنية', p: 'افتراضيًا يظهر اسمك «متبرع مجهول». لا يظهر اسم العرض الذي اخترته في القائمة العلنية إلا إذا حددت الخانة الخاصة بذلك صراحةً. لا يُعرض بريدك الإلكتروني ولا هاتفك ولا بياناتك الأخرى علنًا أبدًا. يمكنك طلب تغيير اسم العرض أو حذفه في أي وقت.' },
      { h: 'مدفوعات Swish والتحويلات البنكية', p: 'تتم عملية الدفع نفسها في Swish أو مصرفك وليس على هذا الموقع. عند وصول الدفعة قد يزوّدنا مزوّد الدفع باسم الدافع ورقم هاتفه أو بيانات حسابه. نستخدمها فقط لمطابقة الدفعة مع التزامك ولأغراض المحاسبة، ولا تُعرض في القائمة العلنية.' },
      { h: 'مدة الاحتفاظ', p: 'تُحذف بيانات التسجيل خلال 12 شهرًا من انتهاء الحملة. أما سجلات الدفع الداخلة في المحاسبة فتُحفظ سبع سنوات بعد نهاية السنة التقويمية التي انتهت فيها السنة المالية، وفق قانون المحاسبة السويدي، إذا كنا ملزمين بمسك الدفاتر. يمكنك أن تطلب حذف بقية البيانات مبكرًا.' },
      { h: 'من يستلم البيانات', p: 'أعضاء مجلس الإدارة الذين يديرون التبرعات فقط. نستعين بمزوّدي خدمات لتشغيل الموقع: الاستضافة وقاعدة البيانات، وعند اختيارك فقط البريد أو الرسائل النصية أو واتساب. يعالجون البيانات نيابةً عنا بموجب اتفاقية معالجة بيانات (المادة 28 من GDPR).' },
      { h: 'النقل خارج الاتحاد الأوروبي/المنطقة الاقتصادية الأوروبية', p: 'إذا كان مزوّد خدمة يخزّن البيانات أو يصل إليها خارج الاتحاد الأوروبي/المنطقة الاقتصادية الأوروبية (مثل الولايات المتحدة)، فإن النقل محمي بضمانة يقتضيها GDPR، مثل إطار خصوصية البيانات بين الاتحاد الأوروبي والولايات المتحدة أو البنود التعاقدية النموذجية. تواصل معنا لمعرفة التفاصيل.' },
      { h: 'لا قرارات آلية', p: 'لا نستخدم اتخاذ القرار الآلي ولا التنميط.' },
      { h: 'ملفات تعريف الارتباط', p: 'لا يستخدم هذا الموقع العام ملفات تعريف ارتباط للإعلانات أو التحليلات. يحفظ اختيارك للغة في متصفحك (التخزين المحلي) وهو ضروري لعمل الموقع كما اخترت. لا حاجة إلى شريط موافقة على الكوكيز لذلك.' },
      { h: 'حقوقك', p: 'لك الحق في الاطلاع على بياناتك وتصحيحها وحذفها، وفي تقييد المعالجة أو الاعتراض عليها، والحصول على نسخة من بياناتك، وسحب موافقتك في أي وقت. سحب الموافقة لا يؤثر على المعالجة التي تمت قبله. تواصل معنا لممارسة هذه الحقوق.\n\nيمكنك أيضًا تقديم شكوى إلى هيئة حماية الخصوصية السويدية (IMY) على imy.se.' }
    ]
  }
};

// Stored text wins, per language, when it has at least one section.
export function resolvePolicy(stored: PrivacyStored | null | undefined, lang: Lang): PolicyLang {
  const s = stored?.langs?.[lang];
  return s && s.sections?.length ? s : POLICY_DEFAULTS[lang];
}

export function resolveController(stored: PrivacyStored | null | undefined): Controller {
  const c = stored?.controller ?? {};
  const env = {
    orgNumber: process.env.NEXT_PUBLIC_ORG_NUMBER, address: process.env.NEXT_PUBLIC_ADDRESS,
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL, phone: process.env.NEXT_PUBLIC_CONTACT_PHONE
  };
  const pick = (v: string | undefined, e: string | undefined) => (v?.trim() || e?.trim() || '');
  return { name: pick(c.name, ''), orgNumber: pick(c.orgNumber, env.orgNumber), address: pick(c.address, env.address), email: pick(c.email, env.email), phone: pick(c.phone, env.phone) };
}
