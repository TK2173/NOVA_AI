// NOVA AI safety guardrails.
// This is a basic layer, not a legal-compliance guarantee or a substitute for provider-side moderation.
export const NOVA_SAFETY_POLICY = [
  "Не создавай призывы к терроризму или экстремизму, вербовочные тексты, пропаганду или оправдание террористического насилия.",
  "Не предоставляй практические инструкции, планы, тактики, выбор целей, способы скрыться от правоохранительных органов или советы по финансированию/организации террористических и насильственных преступлений.",
  "Не помогай создавать, распространять или улучшать материалы, предназначенные для вербовки, угроз, подстрекательства к насилию, преследования или разжигания ненависти к защищаемым группам.",
  "Не помогай совершать преступления, причинять физический вред, обходить защиту или скрывать противоправную деятельность.",
  "Не генерируй сексуальный контент с несовершеннолетними, эксплуатационный контент или инструкции по вовлечению несовершеннолетних в опасные/противоправные действия.",
  "Если запрос о терроризме, экстремизме, оружии, насилии или незаконной деятельности носит новостной, исторический, учебный, профилактический или критический характер, отвечай нейтрально и безопасно без операционных деталей.",
  "При сомнении откажись от опасной части запроса и предложи безопасную альтернативу. Не утверждай, что гарантируешь юридическое соответствие."
].join(" ");

const operationalPatterns = [
  // Russian direct calls/plans for terrorist or extremist violence
  /(?:как|способ|инструкция|план|пошагово|научи|помоги).{0,100}(?:совершить|организовать|устроить|подготовить|провести).{0,80}(?:теракт|террористическ\w*\s+акт|нападени\w*|взрыв|массов\w*\s+убийств\w*)/iu,
  /(?:вербов\w*|привлеч\w*\s+людей|набира\w*\s+людей).{0,100}(?:террор\w*|экстремист\w*|боевик\w*)/iu,
  /(?:призыв\w*|агитаци\w*|манифест\w*|пропаганд\w*).{0,100}(?:совершать|поддерживать|оправдывать|повторить).{0,80}(?:теракт\w*|террор\w*|экстремист\w*|насили\w*)/iu,
  // English equivalents
  /(?:how to|steps to|instructions to|help me|plan to).{0,100}(?:carry out|organize|prepare|commit).{0,80}(?:terrorist attack|terrorism|mass attack|mass killing)/iu,
  /(?:recruit|recruiting|recruitment).{0,80}(?:terrorist|extremist|militant)/iu,
  /(?:propaganda|manifesto|incitement).{0,80}(?:terrorist attack|terrorism|extremist violence)/iu,
  // Requests to evade law enforcement while planning violent crimes
  /(?:как|способ|инструкция).{0,80}(?:не попасться|скрыться от полиции|обойти правоохранител\w*).{0,100}(?:теракт\w*|нападени\w*|убийств\w*|взрыв\w*)/iu,
  /(?:avoid detection|evade police|avoid law enforcement).{0,100}(?:terrorist attack|attack|bombing|mass killing)/iu
];

const unsafeOutputPatterns = [
  /(?:шаг\s*1|первым делом|сначала).{0,180}(?:выбери цель|подготовь взрыв|организуй нападение|соверши теракт)/iu,
  /(?:to carry out the attack|step 1.{0,80}(?:choose a target|prepare an explosive|organize an attack))/iu,
  /(?:присоединяйтесь|вступайте|вербуем).{0,100}(?:террористическ\w*|экстремистск\w* групп\w*)/iu
];

export function moderateInput(text = "") {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (!normalized) return { allowed: true };
  return { allowed: !operationalPatterns.some((pattern) => pattern.test(normalized)) };
}

export function moderateOutput(text = "") {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  return { allowed: !unsafeOutputPatterns.some((pattern) => pattern.test(normalized)) };
}
