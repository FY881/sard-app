/** Human comparison table for the membership hub (mirrors PLAN_v1.1 §1). */
import type { L10n, Tier } from './tiers';

export interface MatrixRow {
  label: L10n;
  cells: Record<Tier, L10n | boolean>;
}

const L = (ar: string, en: string): L10n => ({ ar, en });
const all = (v: L10n | true): Record<Tier, L10n | true> => ({ free: v, plus: v, pro: v, legend: v });

export const TIER_MATRIX: MatrixRow[] = [
  { label: L('القراءة، الخطوط العربية، التشكيل، الثيمات الأساسية', 'Reading, Arabic fonts, tashkeel, basic themes'), cells: all(true) },
  { label: L('أكثر من ٤٠ ميزة مجانية جديدة (إنجازات، وسوم، قفل، ذكاء محلي…)', '40+ new free features (badges, tags, lock, on-device AI…)'), cells: all(true) },
  { label: L('التنزيل للأوفلاين', 'Offline downloads'), cells: { free: L('٣٠٠ فصل', '300 chapters'), plus: L('بلا حد', 'Unlimited'), pro: L('بلا حد', 'Unlimited'), legend: L('بلا حد', 'Unlimited') } },
  { label: L('تصدير PDF/EPUB', 'PDF/EPUB export'), cells: { free: L('فصل واحد', 'One chapter'), plus: L('رواية/مجلد/مدى', 'Novel/volume/range'), pro: L('+ قوالب وغلاف مخصص', '+ templates & cover'), legend: L('+ دفعات بالخلفية', '+ background batches') } },
  { label: L('الذكاء الاصطناعي (مفتاحك) يوميًا', 'AI per day (your key)'), cells: { free: L('٥', '5'), plus: L('٥٠', '50'), pro: L('٢٠٠', '200'), legend: L('بلا حد', 'Unlimited') } },
  { label: L('الوكلاء', 'Agents'), cells: { free: L('٢', '2'), plus: L('كل الوكلاء', 'All agents'), pro: L('+ جدولة', '+ scheduling'), legend: L('+ وكلاء مخصصون', '+ custom agents') } },
  { label: L('ثيمات وخامات وأصوات مميزة', 'Premium themes, textures, sounds'), cells: { free: false, plus: true, pro: true, legend: L('+ حصرية', '+ exclusive') } },
  { label: L('قفل التطبيق، الرف المخفي، النسخ المشفّر', 'App lock, hidden shelf, encrypted backup'), cells: { free: L('القفل فقط', 'Lock only'), plus: true, pro: true, legend: true } },
  { label: L('ملخص القراءة', 'Reading wrap-up'), cells: { free: L('شهري', 'Monthly'), plus: L('+ سنوي', '+ yearly'), pro: L('+ بطاقة مشاركة', '+ share card'), legend: L('+ أرشيف كامل', '+ full archive') } },
  { label: L('ملفات قارئ لكل رواية', 'Per-novel reader profiles'), cells: { free: L('١', '1'), plus: L('٥', '5'), pro: L('بلا حد', 'Unlimited'), legend: L('بلا حد', 'Unlimited') } },
  { label: L('مراجعة المفردات، فلاتر ذكية، جدولة وتنظيف التنزيل', 'Vocab review, smart filters, download scheduler & cleanup'), cells: { free: false, plus: true, pro: true, legend: true } },
  { label: L('تجميد السلسلة، الحرف المزخرف، اختبار الفهم', 'Streak freeze, drop cap, comprehension quiz'), cells: { free: false, plus: false, pro: true, legend: true } },
  { label: L('شارة العضوية', 'Membership badge'), cells: { free: false, plus: L('فضية', 'Silver'), pro: L('ذهبية', 'Gold'), legend: L('أسطورية متحركة', 'Animated legend') } },
];
