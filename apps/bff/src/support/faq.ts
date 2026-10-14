import {
  supportFaqIds,
  type SupportAction,
  type SupportCatalogGame,
  type SupportChatMode,
  type SupportChatResponse,
  type SupportChatTurn,
  type SupportFaqId,
  type SupportFillField,
  type SupportPromotionSlug,
} from '@brand/contracts';

const faqIdSet = new Set<string>(supportFaqIds);

export function isSupportFaqId(value: string | undefined): value is SupportFaqId {
  return typeof value === 'string' && faqIdSet.has(value);
}

interface FaqEntry {
  aliases: string[];
  en: string;
  ar: string;
  actions: SupportAction[];
  related: SupportFaqId[];
  escalate?: boolean;
}

const faqs: Record<SupportFaqId, FaqEntry> = {
  registration: {
    aliases: ['registration and login', 'التسجيل وتسجيل الدخول'],
    en: 'Register from the header, the homepage form, or the Register page. Signup is two steps with email, password, and your profile. Google, Apple, and Phone are shown and are not available. Telegram sign-in appears only when it is configured. Login is the header Login button. If registration finishes but sign-in does not, use Login with the same email.',
    ar: 'التسجيل من الرأس أو نموذج الصفحة الرئيسية أو صفحة التسجيل. التسجيل خطوتان: البريد وكلمة المرور وبياناتك. غوغل وآبل والهاتف ظاهرة وغير متاحة. تسجيل تيليغرام يظهر فقط عند ضبطه. الدخول من زر الدخول في الرأس. إذا اكتمل التسجيل ولم يتم الدخول، استخدم الدخول بنفس البريد.',
    actions: [{ type: 'open_registration' }, { type: 'open_login' }],
    related: ['verification'],
  },
  verification: {
    aliases: ['account verification', 'التحقق من الحساب'],
    en: 'Email verification is not required to play. A new account can sign in while email is still unverified. Do not send a verification code in chat. If sign-in still fails, use Login or talk to a person.',
    ar: 'التحقق من البريد غير مطلوب للعب. يمكن الدخول حتى لو لم يُتحقق من البريد. لا ترسل رمز تحقق في الدردشة. إذا فشل الدخول، استخدم تسجيل الدخول أو تحدث مع شخص.',
    actions: [{ type: 'open_login' }, { type: 'open_human_support' }],
    related: ['registration', 'contact'],
  },
  deposits: {
    aliases: ['how do i deposit', 'كيف أُودع', 'كيف اودع'],
    en: 'Deposit opens the cashier. It does not move money by itself. Sign in first if you are asked. The payment page collects card details in its own secure step. Do not send a card number, CVV, or a one-time code here. A deposit stays pending until the provider confirms it. This chat cannot mark a payment as successful.',
    ar: 'الإيداع يفتح الصندوق. هو لا ينقل المال بنفسه. سجّل الدخول إذا طُلب منك ذلك. صفحة الدفع تجمع بيانات البطاقة في خطوتها الآمنة. لا ترسل رقم بطاقة أو رمز أمان أو رمزًا لمرة واحدة هنا. يبقى الإيداع معلّقًا حتى يؤكد مزود الدفع. هذه الدردشة لا تستطيع اعتبار الدفع ناجحًا.',
    actions: [{ type: 'open_cashier', mode: 'deposit' }],
    related: ['wallet', 'withdrawals'],
  },
  withdrawals: {
    aliases: ['how do i withdraw', 'كيف أسحب', 'كيف اسحب'],
    en: 'Withdraw opens the cashier for a signed-in player. It does not submit a withdrawal by itself. You finish it in the cashier. Transaction history is not available here, and this chat cannot mark a withdrawal as paid. If one stays pending, talk to a person.',
    ar: 'السحب يفتح الصندوق للاعب الذي سجّل دخوله. هو لا يرسل طلب السحب بنفسه. تُكمله في الصندوق. سجل العمليات غير متاح هنا، وهذه الدردشة لا تستطيع اعتبار السحب مدفوعًا. إذا بقي معلّقًا، تحدث مع شخص.',
    actions: [{ type: 'open_cashier', mode: 'withdraw' }, { type: 'open_human_support' }],
    related: ['wallet', 'contact'],
  },
  wallet: {
    aliases: ['wallet and balance', 'المحفظة والرصيد'],
    en: 'A signed-in balance is shown in the header and on the Account page. Ask to show your balance and this chat reads your own amount. It does not guess, and it does not show anyone else’s balance. Guests are asked to sign in.',
    ar: 'يظهر الرصيد في الرأس وفي صفحة الحساب بعد تسجيل الدخول. اطلب عرض رصيدك وهذه الدردشة تقرأ مبلغك أنت. هي لا تخمن، ولا تعرض رصيد شخص آخر. يُطلب من الزائر تسجيل الدخول.',
    actions: [{ type: 'navigate', target: 'account' }],
    related: ['deposits', 'withdrawals'],
  },
  casino: {
    aliases: ['where is live casino', 'casino and live casino', 'أين الكازينو المباشر'],
    en: 'Casino and Live Casino are separate rooms. On a wide screen they are in the header switch. On a phone they are in the bar under the header. A game card launches immediately. Guests get demo only when that game allows it. Signed-in players launch real money. Up to 5 games can stay open.',
    ar: 'الكازينو والكازينو المباشر غرفتان منفصلتان. على الشاشة الواسعة هما في مبدّل الرأس. على الهاتف هما في الشريط تحت الرأس. بطاقة اللعبة تفتح فورًا. الزائر يحصل على التجربة فقط إذا سمحت بها اللعبة. اللاعب الداخل يفتح اللعب بالمال الحقيقي. يمكن إبقاء حتى 5 ألعاب مفتوحة.',
    actions: [
      { type: 'navigate', target: 'casino' },
      { type: 'navigate', target: 'live_casino' },
    ],
    related: ['favorites', 'sports'],
  },
  sports: {
    aliases: ['sportsbook', 'الرياضة'],
    en: 'Sports opens from the product switch. Guests get a demo sportsbook. Signed-in players get their sportsbook. If the session has ended, sign in again. This chat cannot see odds or place a bet.',
    ar: 'الرياضة تُفتح من مبدّل المنتج. الزائر يحصل على دفتر تجريبي. اللاعب الداخل يحصل على دفتره. إذا انتهت الجلسة، سجّل الدخول مرة أخرى. هذه الدردشة لا ترى الأسعار ولا تضع رهانًا.',
    actions: [{ type: 'navigate', target: 'sports' }],
    related: ['casino'],
  },
  promotions: {
    aliases: ['promotions', 'العروض'],
    en: 'Promotions are three preview cards: Welcome on the floor, Weekend live rooms, and Journal drops. They are not a personal bonus wallet. Creating an account does not credit a bonus. No wagering rules are published here.',
    ar: 'العروض ثلاث بطاقات للمعاينة: الترحيب، وغرف نهاية الأسبوع المباشرة، ومواد المجلة. ليست محفظة مكافآت شخصية. إنشاء الحساب لا يضيف مكافأة. لا تُنشر قواعد رهان هنا.',
    actions: [{ type: 'navigate', target: 'promotions' }],
    related: ['wallet'],
  },
  favorites: {
    aliases: ['favorites and recently played', 'المفضلة والألعاب الأخيرة'],
    en: 'Favorites, Recently played, and Most played are available to a signed-in player. Guests are asked to sign in. A heart saves a favorite. A real-money launch refreshes last played and most played.',
    ar: 'المفضلة والألعاب الأخيرة والأكثر لعبًا متاحة بعد تسجيل الدخول. يُطلب من الزائر تسجيل الدخول. القلب يحفظ مفضلة. إطلاق اللعب بالمال الحقيقي يحدّث الأخيرة والأكثر لعبًا.',
    actions: [
      { type: 'navigate', target: 'favorites' },
      { type: 'navigate', target: 'recently_played' },
    ],
    related: ['casino', 'registration'],
  },
  account: {
    aliases: ['account settings', 'إعدادات الحساب'],
    en: 'The Account page shows the profile already on the account: name, email, currency, country, and whether email is verified. This chat can open that page. It cannot change your password, personal details, or security settings.',
    ar: 'صفحة الحساب تعرض البيانات الموجودة: الاسم والبريد والعملة والبلد وهل تم التحقق من البريد. هذه الدردشة تستطيع فتح الصفحة. لا تستطيع تغيير كلمة المرور أو البيانات الشخصية أو إعدادات الأمان.',
    actions: [{ type: 'navigate', target: 'account' }],
    related: ['wallet', 'responsible'],
  },
  responsible: {
    aliases: ['responsible gaming', 'اللعب المسؤول'],
    en: 'AlphaBet is for adults 18 or older. Deposit limits, time-outs, and self-exclusion are not available in the product yet. Stop when play stops being entertainment. To close an account, use the responsible gaming page and talk to a person. This chat will not change a limit or suggest another game.',
    ar: 'AlphaBet للبالغين من عمر 18 أو أكثر. حدود الإيداع ومهل التوقف والاستبعاد الذاتي غير متاحة في المنتج بعد. توقف عندما لا يعود اللعب تسلية. لإغلاق الحساب، استخدم صفحة اللعب المسؤول وتحدث مع شخص. هذه الدردشة لن تغيّر حدًا ولن تقترح لعبة أخرى.',
    actions: [{ type: 'navigate', target: 'responsible_gaming' }, { type: 'open_human_support' }],
    related: ['contact'],
    escalate: true,
  },
  contact: {
    aliases: ['contact support', 'التواصل مع الدعم'],
    en: 'Talk to a person shows only contact methods that are configured. This chat cannot create a ticket. If none are configured, you can still copy a short summary.',
    ar: 'التحدث مع شخص يعرض وسائل الاتصال المضبوطة فقط. هذه الدردشة لا تنشئ تذكرة. إذا لم تُضبط وسيلة، يمكنك نسخ ملخص قصير.',
    actions: [{ type: 'open_human_support' }],
    related: ['responsible'],
    escalate: true,
  },
};

export type LocalDecision =
  | { kind: 'reply'; response: SupportChatResponse }
  | { kind: 'search'; query: string }
  | { kind: 'balance' }
  | { kind: 'model' };

export function decideSupportTurn(input: {
  mode: SupportChatMode;
  faqId?: string;
  text: string;
  locale: 'en' | 'ar';
  testDepositAvailable: boolean;
  gameTitle?: string;
  authenticated?: boolean;
  history?: SupportChatTurn[];
}): LocalDecision {
  const normalized = normalize(input.text);
  if (isSupportFaqId(input.faqId)) return { kind: 'reply', response: faqReply(input.faqId, input) };
  const exact = faqByAlias(normalized);
  if (exact) return { kind: 'reply', response: faqReply(exact, input) };
  if (isGreeting(normalized)) return { kind: 'reply', response: greeting(input.locale) };
  if (isSensitive(normalized)) return { kind: 'reply', response: sensitiveRefusal(input.locale) };
  if (isResponsibleRequest(normalized)) return { kind: 'reply', response: faqReply('responsible', input) };
  if (isOutOfScope(normalized)) return { kind: 'reply', response: outOfScope(input.locale) };
  const command = matchCommand(input.text, input.gameTitle, input.authenticated === true);
  if (command) return commandReply(command, input);
  const follow = followUp(input);
  if (follow) return follow;
  return { kind: 'model' };
}

export function searchReply(
  locale: 'en' | 'ar',
  query: string,
  games: SupportCatalogGame[],
  mode: SupportChatMode,
): SupportChatResponse {
  const safeQuery = query.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (mode === 'support') {
    return baseReply(
      locale === 'ar'
        ? `البحث في الرأس يستطيع فتح «${safeQuery}». هذه الدردشة لا تختلق ألعابًا.`
        : `Search in the header can open “${safeQuery}”. This chat does not invent games.`,
      [{ type: 'navigate', target: 'search', search: safeQuery }],
      'rules',
      false,
    );
  }
  if (games.length === 0) {
    return baseReply(
      locale === 'ar'
        ? `لم أجد لعبة مطابقة لـ «${safeQuery}» في الكتالوج.`
        : `I could not find a catalog game matching “${safeQuery}”.`,
      [{ type: 'navigate', target: 'search', search: safeQuery }],
      'assistant',
      false,
    );
  }
  const titles = games.map((game) => game.title).join(', ');
  if (games.length === 1 && games[0]) {
    return baseReply(
      locale === 'ar'
        ? `وجدت ${games[0].title} في الكتالوج. جارٍ فتحها في مشغّل الألعاب.`
        : `I found ${games[0].title} in the catalog. Opening it in the game player.`,
      [{ type: 'open_game', gameId: games[0].id }],
      'assistant',
      true,
      { games },
    );
  }
  return baseReply(
    locale === 'ar' ? `وجدت هذه الألعاب في الكتالوج: ${titles}. اختر واحدة لفتحها.` : `I found these catalog games: ${titles}. Choose one to open.`,
    games.map((game) => ({ type: 'open_game' as const, gameId: game.id })),
    'assistant',
    false,
    { games },
  );
}

export function balanceReply(
  locale: 'en' | 'ar',
  balance: { balance: number; currency: string } | 'guest' | 'unavailable',
): SupportChatResponse {
  if (balance === 'guest') {
    return baseReply(
      locale === 'ar'
        ? 'سجّل الدخول لعرض رصيدك. لا أستطيع عرض رصيد لزائر.'
        : 'Sign in to see your balance. I can’t show a balance for a guest.',
      [{ type: 'open_login' }],
      'assistant',
      true,
    );
  }
  if (balance === 'unavailable') {
    return baseReply(
      locale === 'ar'
        ? 'تعذر تحميل الرصيد. يمكنك فتح الحساب للتحقق منه هناك.'
        : 'I couldn’t load the balance. You can open Account and check it there.',
      [{ type: 'navigate', target: 'account' }],
      'assistant',
      false,
    );
  }
  const amount = Number.isFinite(balance.balance) ? balance.balance.toFixed(2) : '';
  if (!amount || !/^[A-Z]{3,4}$/.test(balance.currency)) {
    return balanceReply(locale, 'unavailable');
  }
  return baseReply(
    locale === 'ar' ? `رصيدك ${amount} ${balance.currency}.` : `Your balance is ${amount} ${balance.currency}.`,
    [{ type: 'navigate', target: 'account' }],
    'assistant',
    false,
  );
}

export function isPrivateModelText(text: string): boolean {
  return text.startsWith('Your balance is ') || text.startsWith('رصيدك ');
}

function faqReply(id: SupportFaqId, input: { locale: 'en' | 'ar'; testDepositAvailable: boolean }): SupportChatResponse {
  const entry = faqs[id];
  let message = input.locale === 'ar' ? entry.ar : entry.en;
  if (id === 'deposits' && input.testDepositAvailable) {
    message +=
      input.locale === 'ar'
        ? ' إيداع الاختبار، حين يظهر، خيار منفصل وليس دفعًا بالبطاقة.'
        : ' Test Deposit, when it is shown, is a separate option and is not a card payment.';
  }
  return baseReply(message, entry.actions, 'faq', false, { related: entry.related, escalate: entry.escalate });
}

function commandReply(
  command: Command,
  input: { mode: SupportChatMode; locale: 'en' | 'ar'; testDepositAvailable: boolean },
): LocalDecision {
  const auto = input.mode === 'assistant';
  const say = (en: string, ar: string, actions: SupportAction[], source: 'assistant' | 'rules' = 'assistant') =>
    ({
      kind: 'reply' as const,
      response: baseReply(input.locale === 'ar' ? ar : en, actions, auto ? source : 'rules', auto && actions.length === 1),
    });
  switch (command.type) {
    case 'login':
      return say('Opening Login. I won’t ask for your password.', 'جارٍ فتح تسجيل الدخول. لن أطلب كلمة المرور.', [
        { type: 'open_login' },
      ]);
    case 'register':
      return say(
        'Opening registration. You complete it yourself. Google, Apple, and Phone are not available.',
        'جارٍ فتح التسجيل. تكمله بنفسك. غوغل وآبل والهاتف غير متاحة.',
        [{ type: 'open_registration' }],
      );
    case 'live':
      return say('Opening Live Casino.', 'جارٍ فتح الكازينو المباشر.', [{ type: 'navigate', target: 'live_casino' }]);
    case 'casino':
      return say('Opening Casino.', 'جارٍ فتح الكازينو.', [{ type: 'navigate', target: 'casino' }]);
    case 'sports':
      return say('Opening Sports. I can’t place a bet.', 'جارٍ فتح الرياضة. لا أستطيع وضع رهان.', [
        { type: 'navigate', target: 'sports' },
      ]);
    case 'promotions':
      return say(
        'Opening Promotions. These are preview cards, not personal bonuses.',
        'جارٍ فتح العروض. هذه بطاقات معاينة وليست مكافآت شخصية.',
        [{ type: 'navigate', target: 'promotions' }],
      );
    case 'promo':
      return say('Opening that promotion preview.', 'جارٍ فتح معاينة هذا العرض.', [
        { type: 'open_promotion', slug: command.slug },
      ]);
    case 'deposit':
      return say(
        'Opening Deposit. You complete the payment yourself. I can’t submit it or mark it successful.',
        'جارٍ فتح الإيداع. تكمل الدفع بنفسك. لا أستطيع إرساله أو اعتباره ناجحًا.',
        [{ type: 'open_cashier', mode: 'deposit' }],
      );
    case 'withdraw':
      return say(
        'Opening Withdraw. You complete it yourself. I can’t submit a withdrawal.',
        'جارٍ فتح السحب. تكمله بنفسك. لا أستطيع إرسال سحب.',
        [{ type: 'open_cashier', mode: 'withdraw' }],
      );
    case 'account':
      return say(
        'Opening Account. I can’t change personal or security settings.',
        'جارٍ فتح الحساب. لا أستطيع تغيير الإعدادات الشخصية أو الأمان.',
        [{ type: 'navigate', target: 'account' }],
      );
    case 'scroll':
      return say('Scrolling to the Casino games.', 'جارٍ الانتقال إلى ألعاب الكازينو.', [{ type: 'scroll_to', section: 'games' }]);
    case 'favorites':
      return say('Opening Favorites.', 'جارٍ فتح المفضلة.', [{ type: 'navigate', target: 'favorites' }]);
    case 'recent':
      return say('Opening Recently played.', 'جارٍ فتح الألعاب الأخيرة.', [{ type: 'navigate', target: 'recently_played' }]);
    case 'history':
      return {
        kind: 'reply',
        response: baseReply(
          input.locale === 'ar'
            ? 'سجل العمليات والسحوبات غير متاح في AlphaBet بعد. لا أستطيع اختلاق حالة عملية.'
            : 'Transaction and withdrawal history is not available in AlphaBet yet. I can’t invent a transaction status.',
          [{ type: 'open_human_support' }],
          'rules',
          false,
        ),
      };
    case 'balance':
      return { kind: 'balance' };
    case 'demo':
      return {
        kind: 'reply',
        response: baseReply(
          input.locale === 'ar'
            ? 'نعم، عندما تسمح اللعبة بذلك. الزائر يفتح التجربة من بطاقة اللعبة. إذا لم تتوفر تجربة، يلزم تسجيل الدخول. اللاعب الداخل يفتح اللعب بالمال الحقيقي.'
            : 'Yes, when that game allows it. A guest launches demo from the game card. If the game has no demo, sign in is required. A signed-in player launches real money.',
          [{ type: 'scroll_to', section: 'games' }],
          'rules',
          false,
        ),
      };
    case 'fill':
      return fillDecision(command, input);
    case 'refuse':
      return { kind: 'reply', response: sensitiveRefusal(input.locale) };
    case 'missing_promo':
      return {
        kind: 'reply',
        response: baseReply(
          input.locale === 'ar'
            ? 'لا يوجد حقل لرمز ترويجي في AlphaBet. العروض ثلاث بطاقات معاينة في صفحة العروض.'
            : 'AlphaBet has no promo code field. Promotions are the three preview cards on the Promotions page.',
          [{ type: 'navigate', target: 'promotions' }],
          'rules',
          false,
        ),
      };
    case 'fill_limited':
      return {
        kind: 'reply',
        response: baseReply(
          input.locale === 'ar'
            ? 'أستطيع ملء البحث أو فلتر الألعاب أو مبلغ الإيداع أو السحب أو الاسم أو البلد أو الهاتف أو البريد في التسجيل. لن أملأ كلمة مرور أو رمزًا أو بيانات بطاقة، ولن أرسل النموذج.'
            : 'I can fill search, the lobby filter, a deposit or withdrawal amount, and a registration first name, last name, country, phone, or email. I won’t fill a password, a code, or card details, and I won’t submit the form.',
          [],
          'rules',
          false,
        ),
      };
    case 'registration_blocked':
      return {
        kind: 'reply',
        response: baseReply(
          input.locale === 'ar'
            ? 'أنت مسجّل الدخول. لن أملأ نموذج تسجيل جديد ولن أغيّر ملفك من الدردشة.'
            : 'You’re signed in. I won’t fill a new registration form or change your profile from chat.',
          [{ type: 'navigate', target: 'account' }],
          'rules',
          false,
        ),
      };
    case 'clarify_game':
      return {
        kind: 'reply',
        response: baseReply(
          input.locale === 'ar' ? 'أي لعبة تريد فتحها؟' : 'Which game should I open?',
          [],
          'rules',
          false,
        ),
      };
    case 'search':
      if (input.mode !== 'assistant') {
        return { kind: 'reply', response: searchReply(input.locale, command.query, [], 'support') };
      }
      return { kind: 'search', query: command.query };
    default:
      return { kind: 'model' };
  }
}

type Command =
  | {
      type:
        | 'login'
        | 'register'
        | 'live'
        | 'casino'
        | 'sports'
        | 'promotions'
        | 'deposit'
        | 'withdraw'
        | 'account'
        | 'scroll'
        | 'favorites'
        | 'recent'
        | 'history'
        | 'balance'
        | 'clarify_game'
        | 'demo'
        | 'refuse'
        | 'missing_promo'
        | 'registration_blocked'
        | 'fill_limited';
    }
  | { type: 'promo'; slug: SupportPromotionSlug }
  | { type: 'search'; query: string }
  | { type: 'fill'; field: SupportFillField; value: string; authenticated: boolean };

function matchCommand(text: string, gameTitle: string | undefined, authenticated = false): Command | null {
  const n = normalize(text);
  const filled = matchFill(n, authenticated);
  if (filled) return filled;
  if (/^(?:please )?(?:open|show) (?:the )?(?:login|sign in)(?: dialog| screen| page)?$/.test(n) || n === 'افتح تسجيل الدخول' || n === 'أظهر تسجيل الدخول') {
    return { type: 'login' };
  }
  if (
    /^(?:please )?(?:open|show) (?:the )?(?:registration|register|sign up)(?: dialog| screen| page| form)?$/.test(n) ||
    n === 'افتح التسجيل' ||
    n === 'أظهر التسجيل'
  ) {
    return { type: 'register' };
  }
  if (isDemoQuestion(n)) return { type: 'demo' };
  if (/^(?:please )?(?:go to|take me to|open|show) (?:the )?live casino$/.test(n) || n === 'اذهب إلى الكازينو المباشر' || n === 'افتح الكازينو المباشر') {
    return { type: 'live' };
  }
  if (/^(?:please )?(?:go to|take me to|open|show) (?:the )?casino(?: games)?$/.test(n)) return { type: 'casino' };
  if (/^(?:please )?(?:go to|take me to|open|show) (?:the )?(?:sports|sportsbook)$/.test(n)) return { type: 'sports' };
  if (/^(?:please )?(?:show|open|go to|take me to) (?:my )?(?:available )?promotions$/.test(n) || n === 'أظهر العروض' || n === 'اعرض العروض') {
    return { type: 'promotions' };
  }
  if (/^(?:please )?(?:open|show) (?:the )?weekend live(?: rooms)?$/.test(n)) return { type: 'promo', slug: 'weekend-live' };
  if (/^(?:please )?(?:open|show) (?:the )?journal drops$/.test(n)) return { type: 'promo', slug: 'journal-drops' };
  if (/^(?:please )?(?:open|show) (?:the )?welcome (?:promo|promotion)$/.test(n)) return { type: 'promo', slug: 'welcome' };
  if (
    /^(?:please )?(?:open|show) (?:the )?deposit(?: interface| cashier)?$/.test(n) ||
    n === 'افتح الإيداع' ||
    n === 'افتح الايداع'
  ) {
    return { type: 'deposit' };
  }
  if (/^(?:please )?(?:open|show) (?:the )?withdraw(?:al)?(?: interface| cashier)?$/.test(n) || n === 'افتح السحب') {
    return { type: 'withdraw' };
  }
  if (isBalanceAsk(n)) return { type: 'balance' };
  if (/^(?:please )?(?:go to|take me to|open|show) (?:my )?account(?: settings)?$/.test(n) || n === 'اذهب إلى إعدادات الحساب') {
    return { type: 'account' };
  }
  if (/^(?:please )?scroll to (?:the )?(?:casino )?games$/.test(n)) return { type: 'scroll' };
  if (/^(?:please )?(?:go to|open|show) (?:my )?favorites$/.test(n)) return { type: 'favorites' };
  if (/^(?:please )?(?:go to|open|show) (?:my )?recently played$/.test(n)) return { type: 'recent' };
  if (
    /^(?:please )?(?:find|show) (?:my )?(?:withdrawal|transaction) history$/.test(n) ||
    n === 'سجل السحب' ||
    n === 'سجل العمليات'
  ) {
    return { type: 'history' };
  }
  if (/^(?:please )?open this game$/.test(n)) {
    const title = safeQuery(gameTitle ?? '');
    return title ? { type: 'search', query: title } : { type: 'clarify_game' };
  }
  const found = text.trim().match(/^(?:please\s+)?(?:find|search(?:\s+for)?|open)\s+(.+?)[.!?]?\s*$/i);
  const query = safeQuery(found?.[1] ?? '');
  if (!query || /^(?:login|register|registration|deposit|withdraw|withdrawal|it|that|this|them|there)$/i.test(query)) return null;
  if (found) return { type: 'search', query };
  return null;
}

function greeting(locale: 'en' | 'ar'): SupportChatResponse {
  return baseReply(
    locale === 'ar' ? 'مرحبًا. أستطيع المساعدة في AlphaBet. اختر موضوعًا أو اسأل عن الموقع.' : 'Hello. I can help with AlphaBet. Pick a topic, or ask about the site.',
    [],
    'rules',
    false,
  );
}

function outOfScope(locale: 'en' | 'ar'): SupportChatResponse {
  return baseReply(
    locale === 'ar'
      ? 'أساعد فقط في أسئلة AlphaBet. لا أكتب محتوى عامًا ولا أكشف تعليمات داخلية.'
      : 'I only help with AlphaBet. I can’t write general content or reveal internal instructions.',
    [],
    'rules',
    false,
  );
}

function sensitiveRefusal(locale: 'en' | 'ar'): SupportChatResponse {
  return baseReply(
    locale === 'ar'
      ? 'لا أستطيع تنفيذ ذلك. لا ترسل كلمة مرور أو رمز تحقق أو بيانات بطاقة في الدردشة. أكمل الخطوات الحساسة بنفسك في الشاشات الموثوقة، أو تحدث مع شخص.'
      : 'I can’t do that. Don’t send a password, one-time code, or card details in chat. Complete sensitive steps yourself in the trusted screens, or talk to a person.',
    [{ type: 'open_human_support' }],
    'rules',
    false,
  );
}

function baseReply(
  message: string,
  actions: SupportAction[],
  source: SupportChatResponse['source'],
  autoRun: boolean,
  extra: { related?: SupportFaqId[]; escalate?: boolean; games?: SupportCatalogGame[] } = {},
): SupportChatResponse {
  const escalate = extra.escalate === true || actions.some((action) => action.type === 'open_human_support');
  return {
    message,
    actions: actions.slice(0, 8),
    confidence: 'known',
    escalate,
    source,
    autoRun,
    ...(extra.related ? { related: extra.related } : {}),
    ...(extra.games ? { games: extra.games } : {}),
  };
}

function faqByAlias(normalized: string): SupportFaqId | null {
  for (const id of supportFaqIds) {
    if (faqs[id].aliases.some((alias) => normalize(alias) === normalized)) return id;
  }
  return null;
}

function isGreeting(text: string): boolean {
  return /^(?:hi|hello|hey|good morning|good evening|مرحبا|مرحباً|السلام عليكم|أهلا|اهلا)$/.test(text);
}

function isOutOfScope(text: string): boolean {
  return (
    /\b(?:write|generate|draw|poem|weather|homework|python|javascript|source code|system prompt|api key)\b/.test(text) ||
    /ignore (?:all |the )?(?:previous|prior) instructions/.test(text) ||
    text.includes('.env') ||
    /اكتب كود|اكتب قصيدة|مفتاح api|التعليمات الداخلية/.test(text)
  );
}

function isSensitive(text: string): boolean {
  return (
    /\b(?:password|otp|one-time code|recovery code|cvv|place a bet|place my bet|cancel my bet|betting strategy|martingale)\b/.test(text) ||
    /\b(?:change|update) my (?:email|password|phone|address)\b/.test(text) ||
    /\b(?:set|change|lower|raise) my (?:deposit|loss) limit\b/.test(text) ||
    /\b(?:submit|confirm|send|complete) (?:my |the )?(?:deposit|withdrawal|withdraw|payment)\b/.test(text) ||
    /\b(?:card number|cvv|cvc|seed phrase|private key|bank account|iban)\b/.test(text) ||
    /كلمة المرور|كلمة السر|رمز التحقق|بيانات البطاقة|رقم البطاقة/.test(text)
  );
}

function isResponsibleRequest(text: string): boolean {
  return /\b(?:self-?exclud|cool-?off|close my account|stop gambling)\b/.test(text) || /استبعاد|أغلق حسابي/.test(text);
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[؟?!.,]/g, '').replace(/\s+/g, ' ');
}

function safeQuery(value: string): string | null {
  const query = value.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (query.length < 2) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(query) || query.includes('//') || query.includes('\\')) return null;
  return query;
}

const fillFieldPattern =
  'search(?: field| box)?|catalog search|lobby filter|game filter|filter|deposit amount|withdrawal amount|withdraw amount|first name|last name|country|phone number|phone|email|promo code|promocode|bonus code|password|otp|cvv|card number|bank account|seed phrase|private key';

function matchFill(text: string, authenticated: boolean): Command | null {
  const shorthand = text.match(/^(?:please )?(deposit|withdraw|withdrawal) (\d+(?:\.\d{1,2})?)$/);
  if (shorthand?.[1] && shorthand[2]) {
    return {
      type: 'fill',
      field: shorthand[1] === 'deposit' ? 'deposit_amount' : 'withdraw_amount',
      value: shorthand[2],
      authenticated,
    };
  }
  const verb = '(?:please )?(?:fill|type|enter|put|set|prefill)';
  const lead = text.match(new RegExp(`^${verb} (?:in )?(?:the |my )?(${fillFieldPattern}) (?:with|to|as) (.+)$`));
  const trail = text.match(new RegExp(`^${verb} (.+?) (?:in|into) (?:the |my )?(${fillFieldPattern})$`));
  const label = lead?.[1] ?? trail?.[2];
  const raw = (lead?.[2] ?? trail?.[1])?.trim();
  if (!label || !raw) {
    if (/^(?:please )?(?:fill|type|enter|prefill)\b/.test(text)) return { type: 'fill_limited' };
    return null;
  }
  const field = fieldFrom(label);
  if (field === 'sensitive') return { type: 'refuse' };
  if (field === 'promo') return { type: 'missing_promo' };
  if (!field) return null;
  return { type: 'fill', field, value: raw, authenticated };
}

function fieldFrom(label: string): SupportFillField | 'promo' | 'sensitive' | null {
  if (/password|otp|cvv|card number|bank account|seed phrase|private key/.test(label)) return 'sensitive';
  if (/promo|bonus code/.test(label)) return 'promo';
  if (label.startsWith('search')) return 'search';
  if (label === 'catalog search' || label.endsWith('filter')) return 'catalog_search';
  if (label === 'deposit amount') return 'deposit_amount';
  if (label.includes('withdraw')) return 'withdraw_amount';
  if (label === 'first name') return 'first_name';
  if (label === 'last name') return 'last_name';
  if (label === 'country') return 'country';
  if (label.startsWith('phone')) return 'phone';
  if (label === 'email') return 'email';
  return null;
}

function fillDecision(
  command: Extract<Command, { type: 'fill' }>,
  input: { mode: SupportChatMode; locale: 'en' | 'ar'; testDepositAvailable: boolean },
): LocalDecision {
  const profile = command.field === 'email' || command.field === 'first_name' || command.field === 'last_name' || command.field === 'country' || command.field === 'phone';
  if (profile && command.authenticated) return commandReply({ type: 'registration_blocked' }, input);
  const value = parseFillValue(command.field, command.value);
  if (!value) {
    return {
      kind: 'reply',
      response: baseReply(
        command.field === 'country'
          ? input.locale === 'ar'
            ? 'استخدم رمز بلد من حرفين، مثل MT. لن أخمن البلد.'
            : 'Use a two-letter country code, such as MT. I won’t guess a country.'
          : input.locale === 'ar'
            ? 'أستطيع ملء ذلك فقط بقيمة صالحة، ولن أخمن القيمة.'
            : 'I can fill that only with a valid value, and I won’t guess one.',
        [],
        'rules',
        false,
      ),
    };
  }
  if ((command.field === 'deposit_amount' || command.field === 'withdraw_amount') && !command.authenticated) {
    const deposit = command.field === 'deposit_amount';
    return {
      kind: 'reply',
      response: baseReply(
        input.locale === 'ar'
          ? deposit
            ? `سجّل الدخول لوضع ${value} في مبلغ الإيداع. لن أرسل الدفع.`
            : `سجّل الدخول لوضع ${value} في مبلغ السحب. لن أرسل السحب.`
          : deposit
            ? `Sign in to put ${value} in the deposit amount. I won’t submit the payment.`
            : `Sign in to put ${value} in the withdrawal amount. I won’t submit the withdrawal.`,
        [{ type: 'open_login' }],
        'assistant',
        input.mode === 'assistant',
      ),
    };
  }
  return {
    kind: 'reply',
    response: baseReply(
      fillCopy(command.field, value, input.locale),
      [{ type: 'fill_field', field: command.field, value }],
      'assistant',
      input.mode === 'assistant',
    ),
  };
}

function fillCopy(field: SupportFillField, value: string, locale: 'en' | 'ar'): string {
  if (locale === 'ar') {
    if (field === 'search') return `سأضع «${value}» في البحث. لن أفتح لعبة إلا إذا طلبت ذلك.`;
    if (field === 'catalog_search') return `سأضع «${value}» في فلتر الألعاب. هذا لا يطلق لعبة.`;
    if (field === 'deposit_amount') return `سأضع ${value} في مبلغ الإيداع. أنت تؤكد الدفع بنفسك. لن أرسله.`;
    if (field === 'withdraw_amount') return `سأضع ${value} في مبلغ السحب. أنت تؤكد السحب بنفسك. لن أرسله.`;
    if (field === 'email') return `سأضع ${value} في بريد التسجيل. أنت تكمل التسجيل بنفسك. لن أضع كلمة مرور.`;
    if (field === 'first_name') return `سأضع ${value} في الاسم الأول. لن أرسل نموذج التسجيل.`;
    if (field === 'last_name') return `سأضع ${value} في اسم العائلة. لن أرسل نموذج التسجيل.`;
    if (field === 'country') return `سأضع ${value} في بلد التسجيل. لن أرسل النموذج.`;
    return `سأضع ${value} في هاتف التسجيل. لن أرسل النموذج.`;
  }
  if (field === 'search') return `I’ll put “${value}” in search. I won’t open a game unless you ask.`;
  if (field === 'catalog_search') return `I’ll apply “${value}” as the lobby filter. That does not launch a game.`;
  if (field === 'deposit_amount') return `I’ll put ${value} in the deposit amount. You confirm the payment yourself. I won’t submit it.`;
  if (field === 'withdraw_amount') return `I’ll put ${value} in the withdrawal amount. You confirm it yourself. I won’t submit it.`;
  if (field === 'email') return `I’ll put ${value} in the registration email. You finish signup yourself. I won’t set a password.`;
  if (field === 'first_name') return `I’ll put ${value} in the registration first name. I won’t submit the form.`;
  if (field === 'last_name') return `I’ll put ${value} in the registration last name. I won’t submit the form.`;
  if (field === 'country') return `I’ll put ${value} in the registration country. I won’t submit the form.`;
  return `I’ll put ${value} in the registration phone. I won’t submit the form.`;
}

function parseFillValue(field: SupportFillField, raw: string): string | null {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (field === 'deposit_amount' || field === 'withdraw_amount') return formatAmount(value);
  if (field === 'search' || field === 'catalog_search') return safeQuery(value);
  if (field === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 80 ? value : null;
  if (field === 'country') return /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : null;
  if (field === 'phone') {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 6 && digits.length <= 15 ? digits : null;
  }
  return /^[\p{L}][\p{L}\s'.-]{0,39}$/u.test(value) ? value : null;
}

function formatAmount(raw: string): string | null {
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(raw)) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) return null;
  if (Number.isInteger(amount)) return String(amount);
  return amount.toFixed(2).replace(/0$/, '');
}

function isBalanceAsk(text: string): boolean {
  const plain = text.replace(/['’]/g, '');
  return (
    /\b(?:my balance|account balance|wallet balance)\b/.test(plain) ||
    /^(?:please )?(?:show|check|see) (?:me )?(?:the |my )?balance$/.test(plain) ||
    plain === 'balance' ||
    /^(?:please )?(?:how much(?: money)? do i have|what do i have in my wallet)$/.test(plain) ||
    text === 'رصيدي' ||
    text === 'كم رصيدي' ||
    text === 'ما رصيدي' ||
    text === 'أظهر رصيدي' ||
    text === 'اعرض رصيدي' ||
    text === 'أرني رصيدي'
  );
}

function isDemoQuestion(text: string): boolean {
  return (
    /^(?:do you |does alphabet )?(?:have|offer|support) (?:a )?demo(?: play)?$/.test(text) ||
    /^(?:can i|how do i) (?:play|use) (?:a )?demo(?: play)?$/.test(text) ||
    text === 'demo play' ||
    text === 'demo' ||
    text === 'هل لديكم لعب تجريبي' ||
    text === 'هل يوجد لعب تجريبي'
  );
}

type FollowTopic = 'demo' | 'balance' | 'live' | 'withdraw' | 'deposit' | 'promotions' | 'favorites' | 'recent' | 'registration' | 'sports' | 'casino' | 'search';

function followUp(input: {
  mode: SupportChatMode;
  text: string;
  locale: 'en' | 'ar';
  testDepositAvailable: boolean;
  gameTitle?: string;
  authenticated?: boolean;
  history?: SupportChatTurn[];
}): LocalDecision | null {
  const kind = followKind(normalize(input.text));
  if (!kind) return null;
  const prior = (input.history ?? []).slice(0, -1);
  const authenticated = input.authenticated === true;
  if (kind === 'act') {
    const command = lastCommand(prior, input.gameTitle, authenticated);
    if (command && isReplayable(command)) return commandReply(command, input);
    const mapped = commandForTopic(inferTopic(prior), prior, input.gameTitle, authenticated);
    if (mapped) return commandReply(mapped, input);
    return { kind: 'reply', response: clarify(input.locale, 'act') };
  }
  const topic = inferTopic(prior);
  if (!topic) return { kind: 'reply', response: clarify(input.locale, 'explain') };
  return { kind: 'reply', response: explainTopic(topic, input.locale) };
}

function followKind(text: string): 'explain' | 'act' | null {
  if (/^(?:why|why not|how|how so|how come|what do you mean|لماذا|ليش|كيف|كيف ذلك|لماذا ذلك)$/.test(text)) return 'explain';
  if (/^(?:show me|open it|open that|go there|do that|do it|yes|that one|أرني|اعرض|أظهر|افتحه|افتحها|اذهب هناك|نعم)$/.test(text)) return 'act';
  return null;
}

function lastCommand(history: SupportChatTurn[], gameTitle: string | undefined, authenticated: boolean): Command | null {
  for (const turn of [...history].reverse()) {
    if (turn.role !== 'user' || followKind(normalize(turn.content))) continue;
    const command = matchCommand(turn.content, gameTitle, authenticated);
    if (command) return command;
  }
  return null;
}

function isReplayable(command: Command): boolean {
  return (
    command.type !== 'demo' &&
    command.type !== 'history' &&
    command.type !== 'refuse' &&
    command.type !== 'missing_promo' &&
    command.type !== 'registration_blocked' &&
    command.type !== 'fill_limited' &&
    command.type !== 'clarify_game'
  );
}

function inferTopic(history: SupportChatTurn[]): FollowTopic | null {
  const patterns: { topic: FollowTopic; pattern: RegExp }[] = [
    { topic: 'demo', pattern: /demo|تجريب/i },
    { topic: 'balance', pattern: /\bbalance\b|رصيد/i },
    { topic: 'live', pattern: /live casino|الكازينو المباشر/i },
    { topic: 'withdraw', pattern: /withdraw|سحب/i },
    { topic: 'deposit', pattern: /deposit|إيداع|ايداع/i },
    { topic: 'promotions', pattern: /promotion|\bpromo\b|عروض/i },
    { topic: 'favorites', pattern: /favorite|المفضلة/i },
    { topic: 'recent', pattern: /recently played|الألعاب الأخيرة/i },
    { topic: 'registration', pattern: /\bregist|sign up|التسجيل/i },
    { topic: 'sports', pattern: /sportsbook|\bsports\b|الرياضة/i },
    { topic: 'casino', pattern: /\bcasino\b|الكازينو/i },
    { topic: 'search', pattern: /\b(?:find|search)\b|بحث/i },
  ];
  for (const turn of [...history].reverse()) {
    for (const item of patterns) {
      if (item.pattern.test(turn.content)) return item.topic;
    }
  }
  return null;
}

function commandForTopic(
  topic: FollowTopic | null,
  history: SupportChatTurn[],
  gameTitle: string | undefined,
  authenticated: boolean,
): Command | null {
  if (!topic) return null;
  if (topic === 'search') {
    const found = lastCommand(history, gameTitle, authenticated);
    return found?.type === 'search' ? found : { type: 'clarify_game' };
  }
  const mapped = {
    demo: { type: 'scroll' },
    balance: { type: 'balance' },
    live: { type: 'live' },
    casino: { type: 'casino' },
    sports: { type: 'sports' },
    promotions: { type: 'promotions' },
    deposit: { type: 'deposit' },
    withdraw: { type: 'withdraw' },
    registration: { type: 'register' },
    favorites: { type: 'favorites' },
    recent: { type: 'recent' },
  } as const;
  return mapped[topic];
}

function explainTopic(topic: FollowTopic, locale: 'en' | 'ar'): SupportChatResponse {
  const copy: Record<FollowTopic, { en: string; ar: string }> = {
    demo: {
      en: 'Demo is only for a guest, and only when that game allows it. Signing in starts real-money play and does not turn an open demo into real money.',
      ar: 'التجربة للزائر فقط، وعندما تسمح اللعبة بذلك. تسجيل الدخول يبدأ اللعب بالمال الحقيقي ولا يحوّل تجربة مفتوحة إلى لعب حقيقي.',
    },
    balance: {
      en: 'That amount is your own wallet after you sign in. I read it from your account and I can’t show a guest balance or anyone else’s.',
      ar: 'هذا المبلغ هو محفظتك بعد تسجيل الدخول. أقرأه من حسابك ولا أستطيع عرض رصيد زائر أو رصيد شخص آخر.',
    },
    deposit: {
      en: 'Deposit only opens the cashier. Money does not move until you finish the payment there. Card details stay on that step, not in chat.',
      ar: 'الإيداع يفتح الصندوق فقط. المال لا يتحرك حتى تكمل الدفع هناك. بيانات البطاقة تبقى في تلك الخطوة، لا في الدردشة.',
    },
    withdraw: {
      en: 'Withdraw only opens the cashier. It does not send the withdrawal. You confirm it yourself.',
      ar: 'السحب يفتح الصندوق فقط. هو لا يرسل طلب السحب. أنت تؤكده بنفسك.',
    },
    live: {
      en: 'Live Casino is its own room, separate from Casino. The header switch opens it on a wide screen, and the bar under the header opens it on a phone.',
      ar: 'الكازينو المباشر غرفة مستقلة عن الكازينو. مبدّل الرأس يفتحه على الشاشة الواسعة، والشريط تحت الرأس يفتحه على الهاتف.',
    },
    casino: {
      en: 'Casino is the main game room. A card launches immediately: demo for a guest when the game allows it, and real money after sign-in.',
      ar: 'الكازينو هو غرفة الألعاب الرئيسية. البطاقة تفتح فورًا: تجربة للزائر إذا سمحت اللعبة، ومال حقيقي بعد تسجيل الدخول.',
    },
    sports: {
      en: 'Sports opens the sportsbook. I can take you there, and I can’t see odds or place a bet.',
      ar: 'الرياضة تفتح دفتر المراهنة. أستطيع أخذك إليه، ولا أستطيع رؤية الأسعار أو وضع رهان.',
    },
    promotions: {
      en: 'Promotions are three preview cards: Welcome, Weekend live, and Journal drops. They are not a personal bonus, and there is no promo code to enter.',
      ar: 'العروض ثلاث بطاقات معاينة: الترحيب، ونهاية الأسبوع، ومواد المجلة. ليست مكافأة شخصية، ولا يوجد رمز ترويجي لإدخاله.',
    },
    registration: {
      en: 'Registration is two steps with your email and profile. Google, Apple, and Phone are shown and are not available. I can open the form, and you submit it.',
      ar: 'التسجيل خطوتان بالبريد وبياناتك. غوغل وآبل والهاتف ظاهرة وغير متاحة. أستطيع فتح النموذج، وأنت ترسله.',
    },
    favorites: {
      en: 'Favorites are saved for a signed-in player. A guest is asked to sign in before a heart can save a game.',
      ar: 'المفضلة تُحفظ للاعب الذي سجّل دخوله. يُطلب من الزائر تسجيل الدخول قبل أن يحفظ القلب لعبة.',
    },
    recent: {
      en: 'Recently played updates after a real-money launch. Guests are asked to sign in before that list opens.',
      ar: 'الألعاب الأخيرة تتحدث بعد إطلاق لعب بالمال الحقيقي. يُطلب من الزائر تسجيل الدخول قبل فتح القائمة.',
    },
    search: {
      en: 'Search uses the catalog. I only open a game the catalog actually returns, and I don’t invent a title.',
      ar: 'البحث يستخدم الكتالوج. أفتح فقط لعبة يعيدها الكتالوج فعلًا، ولا أخترع اسمًا.',
    },
  };
  return baseReply(locale === 'ar' ? copy[topic].ar : copy[topic].en, [], 'rules', false);
}

function clarify(locale: 'en' | 'ar', kind: 'explain' | 'act'): SupportChatResponse {
  if (kind === 'act') {
    return baseReply(
      locale === 'ar' ? 'قل لي ماذا أفتح: صفحة، أو لعبة، أو الصندوق، أو رصيدك.' : 'Tell me what to open: a page, a game, the cashier, or your balance.',
      [],
      'rules',
      false,
    );
  }
  return baseReply(
    locale === 'ar'
      ? 'أي جزء تريد شرحه؟ يمكنني توضيح التجربة أو الرصيد أو الصندوق أو صفحة.'
      : 'Which part should I explain? I can cover demo play, your balance, the cashier, or a page.',
    [],
    'rules',
    false,
  );
}
