export type GameKind = 'casino' | 'live';
export type GameStatus = 'new' | 'hot' | 'live';

export interface Game {
  id: string;
  title: string;
  provider: string;
  kind: GameKind;
  category: string;
  status?: GameStatus;
  art: number;
  imageUrl?: string | null;
}

export interface LobbySection {
  id: string;
  title: string;
  games: Game[];
}

export interface Promotion {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  tone: 'cobalt' | 'coral' | 'mint';
}

export interface Lobby {
  promotions: Promotion[];
  categories: string[];
  sections: LobbySection[];
  providers: string[];
}

export interface SearchResult {
  games: Game[];
  query: string;
}

export type PlatformGameType = 'slots' | 'live-casino';

export interface CatalogProvider {
  id: string;
  code: string;
  name: string;
  displayName: string;
  groupedCode: string | null;
}

export interface CatalogCategory {
  id: string;
  slug: string;
  fullSlug?: string;
  name: string;
  parentId: string | null;
  sortOrder?: number;
}

export interface CatalogGame {
  id: string;
  slug: string;
  title: string;
  kind: GameKind;
  imageUrl: string | null;
  provider: CatalogProvider | null;
  categories: CatalogCategory[];
  demoPlayEnabled: boolean;
  /** Platform `is_active`. Omitted only by older fixtures. */
  active?: boolean;
  /** Platform RTP as provided. Null when Platform sends none. */
  rtp?: string | null;
  /** Platform volatility as provided. Null when Platform sends none. */
  volatility?: string | null;
  /** Platform `provider_game_type`. Null when Platform sends none. */
  gameType?: string | null;
  /** Platform `created_at`. Null when Platform sends none. */
  listedAt?: string | null;
  /** Distinct plays. Present only when a personalization response included it. */
  played?: number;
  /** BET events. Present only when most-played included it. */
  rounds?: number;
  /** Last played time. Present only when a personalization response included it. */
  lastPlayed?: string | null;
}

export interface PlayerFavoritesResponse {
  games: CatalogGame[];
}

export interface PlayerPlayedResponse {
  games: CatalogGame[];
  pagination: CatalogPagination;
}

export interface CatalogPagination {
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
  from: number | null;
  to: number | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface CatalogGameFilters {
  page?: number;
  perPage?: number;
  search?: string;
  category?: string;
  provider?: string;
  groupedProvider?: string;
  type?: PlatformGameType;
}

export interface CatalogGamesResponse {
  games: CatalogGame[];
  pagination: CatalogPagination;
}

export interface CatalogProvidersResponse {
  providers: CatalogProvider[];
}

export interface CatalogCategoriesResponse {
  categories: CatalogCategory[];
}

export interface CatalogLobbyResponse {
  promotions: [];
  categories: CatalogCategory[];
  sections: Array<{
    id: 'games';
    title: 'Games';
    games: CatalogGame[];
  }>;
  providers: CatalogProvider[];
  pagination: CatalogPagination;
}

export type GameLaunchMode = 'demo' | 'real';

export interface GameLaunchResponse {
  launchUrl: string;
  mode: GameLaunchMode;
}

export type GameLaunchErrorCode =
  | 'invalid_game_id'
  | 'game_not_found'
  | 'demo_unavailable'
  | 'game_unavailable'
  | 'auth_required'
  | 'launch_unavailable';

export interface GameLaunchErrorResponse {
  error: { code: GameLaunchErrorCode; message: string };
}

export interface AuthSession {
  authenticated: true;
  playerId: string;
  email: string | null;
  currency: string | null;
  expiresAt: string; // ISO
}

export interface GuestSession {
  authenticated: false;
}

export type SessionResponse = AuthSession | GuestSession;

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'invalid_login'
  | 'auth_unavailable'
  | 'session_ended'
  | 'external_auth_rejected'
  | 'external_auth_unavailable'
  | 'account_restricted';

export interface AuthErrorResponse {
  error: { code: AuthErrorCode; message: string };
}

export interface PlayerProfile {
  playerId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  currency: string | null;
  countryCode: string | null;
  emailVerified: boolean;
}

export interface PlayerBalance {
  balance: number;
  currency: string;
}

export type AccountErrorCode = 'session_ended' | 'account_unavailable';

export interface AccountErrorResponse {
  error: { code: AccountErrorCode; message: string };
}

export interface RegistrationInput {
  email: string;
  password: string;
  country: string;
  currency: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  address: string;
  city: string;
  postalCode: string;
  phonePrefix: string;
  phone: string;
}

export interface RegistrationCountry {
  code: string;
  name: string;
  callingCode: string | null;
}

export interface RegistrationCurrency {
  code: string;
  name: string;
  symbol: string;
}

export interface RegistrationOptions {
  countries: RegistrationCountry[];
  currencies: RegistrationCurrency[];
  defaults: { country: string | null; currency: string | null };
}

export interface RegistrationSuccess {
  status: 'created';
  session: AuthSession;
}

export type RegistrationErrorCode =
  | 'invalid_registration'
  | 'email_already_registered'
  | 'unsupported_country'
  | 'unsupported_currency'
  | 'invalid_phone_prefix'
  | 'weak_password'
  | 'registration_unavailable'
  | 'sign_in_unavailable';

export interface RegistrationErrorResponse {
  error: { code: RegistrationErrorCode; message: string; fields?: Record<string, string> };
}

export type PaymentDirection = 'deposit' | 'withdraw';

export type PaymentIntentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type PaymentMutationStatus = 'redirect' | 'completed' | 'processing' | 'failed';

export interface PaymentMethodField {
  name: string;
  label: string;
  required: boolean;
}

export interface PaymentMethod {
  id: string;
  label: string;
  minAmount: number | null;
  maxAmount: number | null;
  fields: PaymentMethodField[];
  test: boolean;
  mock: boolean;
}

export interface PaymentMethodsResponse {
  currency: string;
  balance: number;
  depositMethods: PaymentMethod[];
  withdrawMethods: PaymentMethod[];
}

export interface PaymentMutationResponse {
  status: PaymentMutationStatus;
  paymentId: string;
  redirectUrl?: string;
}

export interface PaymentStatusResponse {
  status: PaymentIntentStatus;
  direction: PaymentDirection;
}

export type PaymentErrorCode =
  | 'session_ended'
  | 'invalid_amount'
  | 'insufficient_balance'
  | 'method_unavailable'
  | 'provider_unavailable'
  | 'deposit_failed'
  | 'payment_cancelled'
  | 'withdrawal_rejected'
  | 'withdrawal_unavailable'
  | 'duplicate_request';

export interface PaymentErrorResponse {
  error: { code: PaymentErrorCode; message: string };
}

export type SportsLaunchMode = 'demo' | 'real';

export interface SportsLaunchResponse {
  launchUrl: string;
  expiresAt: string;
  mode: SportsLaunchMode;
}

export type SportsLaunchErrorCode =
  | 'invalid_sports_request'
  | 'invalid_sports_path'
  | 'auth_required'
  | 'sports_unavailable';

export interface SportsLaunchErrorResponse {
  error: { code: SportsLaunchErrorCode; message: string };
}

export const supportNavigateTargets = [
  'casino',
  'live_casino',
  'sports',
  'promotions',
  'search',
  'account',
  'responsible_gaming',
  'support',
  'journal',
] as const;

export type SupportNavigateTarget = (typeof supportNavigateTargets)[number];

export type SupportSection =
  | 'casino'
  | 'live_casino'
  | 'sports'
  | 'account'
  | 'promotions'
  | 'search'
  | 'responsible_gaming'
  | 'support'
  | 'other';

export type SupportAction =
  | { type: 'navigate'; target: SupportNavigateTarget; search?: string }
  | { type: 'open_cashier'; mode: 'deposit' | 'withdraw' }
  | { type: 'open_login' }
  | { type: 'open_registration' }
  | { type: 'open_human_support' };

export type SupportConfidence = 'known' | 'general' | 'unknown';

export interface SupportChatContext {
  locale: 'en' | 'ar';
  route: string;
  authenticated: boolean;
  section: SupportSection;
  gameOpen: boolean;
  gameTitle?: string;
}

export interface SupportChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface SupportChatRequest {
  messages: SupportChatTurn[];
  context: SupportChatContext;
}

export interface SupportChatResponse {
  message: string;
  actions: SupportAction[];
  confidence: SupportConfidence;
  escalate: boolean;
}

export type SupportChannelId = 'email' | 'telegram' | 'whatsapp' | 'helpdesk';

export interface SupportChannel {
  id: SupportChannelId;
  kind: 'email' | 'link';
  value: string;
}

export interface SupportChannelsResponse {
  available: boolean;
  channels: SupportChannel[];
}

export type SupportChatErrorCode =
  | 'invalid_support_request'
  | 'ai_unavailable'
  | 'ai_timeout'
  | 'ai_response_invalid'
  | 'support_unavailable';

export interface SupportChatErrorResponse {
  error: { code: SupportChatErrorCode; message: string };
}
