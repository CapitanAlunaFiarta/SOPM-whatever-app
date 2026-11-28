export type Role = 'USER' | 'ADMIN';

export type User = {
  id: number;
  fullName: string;
  username: string;
  email: string;
  role: Role;
  streak: number;
  points: number;
  freezesLeft: number;
  biometricEnabled: boolean;
  lastActiveOn: string | null;
};

export type Session = {
  token: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
};

/** Cheile categoriilor (aceleași pe server); etichetele vin din i18n: category.SPORT etc. */
export const CATEGORIES = ['SPORT', 'STUDY', 'CHORES', 'ENTERTAINMENT'] as const;
export const PRIORITIES = ['Low', 'Medium', 'High'] as const;
export type Category = (typeof CATEGORIES)[number];
export const DEFAULT_CATEGORY: Category = 'CHORES';
export type Priority = (typeof PRIORITIES)[number];
export type TaskStatus = 'Upcoming' | 'Overdue' | 'Completed' | 'Canceled';

export type Task = {
  id: number;
  title: string;
  category: Category;
  priority: Priority;
  status: TaskStatus;
  isRecurring: boolean;
  streakCount: number;
  requiresLocation: boolean;
  latitude: number;
  longitude: number;
  radius: number;
  requiresBiometrics: boolean;
  dueDate: string;
  /** Câmp vechi (primul invitat), păstrat pentru aplicațiile mai vechi. */
  friend: string;
  isOwner: boolean;
  ownerUsername: string;
  ownerName: string;
  /** Ultima mea confirmare. */
  lastCompletedOn: string | null;
  /** Am confirmat azi. */
  completedToday: boolean;
  /** Rolul meu: proprietar, invitat (n-am răspuns) sau membru (am acceptat). */
  myStatus: 'OWNER' | ParticipantStatus | 'NONE';
  /** Mi-am făcut partea: azi (activitate zilnică) sau oricând (activitate unică). */
  confirmedByMe: boolean;
  participants: Participant[];
  /** Proprietarul + cei care au acceptat. */
  memberCount: number;
  /** Câți membri poate avea o activitate (cu tot cu organizator). */
  maxMembers: number;
  confirmedCount: number;
  chat: TaskChat;
  /** A fost trimisă în chatul comunității (oricine o vede acolo poate cere să participe). */
  shared: boolean;
  /** Cererile de participare din comunitate, fără răspuns (le vede doar organizatorul). */
  joinRequests: JoinRequest[];
};

export type JoinRequest = { username: string; fullName: string; requestedAt: string };

export type ParticipantStatus = 'INVITED' | 'ACCEPTED' | 'DECLINED';

export type Participant = {
  username: string;
  fullName: string;
  status: ParticipantStatus;
  /** Și-a făcut partea (azi, la activitățile zilnice). */
  confirmed: boolean;
};

/** Chatul unei activități de grup: se deschide după prima acceptare, doar de citit la 5 zile după încheiere. */
export type TaskChat = {
  available: boolean;
  readOnly: boolean;
  closesAt: string | null;
  messageCount: number;
};

export type TaskMessage = {
  id: number;
  text: string;
  createdAt: string;
  username: string;
  fullName: string;
  mine: boolean;
};

/** Pot confirma și deschide chatul: sunt proprietarul sau am acceptat invitația. */
export const isMember = (task: Task) => task.isOwner || task.myStatus === 'ACCEPTED';

export type TaskInput = {
  title: string;
  category: Category;
  priority: Priority;
  dueDate: string;
  isRecurring: boolean;
  requiresLocation: boolean;
  latitude: number;
  longitude: number;
  radius: number;
  requiresBiometrics: boolean;
  /** Usernamele prietenilor invitați (cei care au refuzat și nu mai sunt aleși rămân „refuzat”). */
  participants: string[];
};

export type CompletionResult = {
  task: Task;
  streak: number;
  points: number;
  freezesLeft: number;
};

/** Mesajele speciale din chatul comunității: streak arătat, invitație la o activitate, versiune nouă. */
export type ChatKind = 'TEXT' | 'STREAK' | 'ACTIVITY' | 'UPDATE';

export type StreakPayload = { streak: number; points: number };
export type ActivityPayload = {
  taskId: number; title: string; category: Category; dueDate: string; isRecurring: boolean; requiresLocation: boolean;
};
export type UpdatePayload = { version: string; build?: number; url?: string };

export type ChatMessage = {
  id: number;
  senderUsername: string;
  senderName: string;
  senderRole: Role | 'SYSTEM';
  /** Text simplu (și varianta citibilă a mesajelor speciale, pentru aplicațiile vechi). */
  text: string;
  createdAt: string;
  kind?: ChatKind;
  payload?: Partial<StreakPayload & ActivityPayload & UpdatePayload> | null;
};

/** Relația mea cu cineva: prieteni, cerere primită (INCOMING) sau trimisă (OUTGOING). */
export type FriendStatus = 'FRIEND' | 'INCOMING' | 'OUTGOING';
export type Relation = FriendStatus | 'NONE' | 'SELF';

export type Friend = {
  username: string;
  fullName: string;
  streak: number;
  points: number;
  status: FriendStatus;
  /** Câmp vechi, păstrat de server pentru aplicațiile mai vechi. */
  direction?: 'incoming' | 'outgoing' | 'mutual';
};

/** Profilul public al cuiva (fără email). */
export type Profile = {
  username: string;
  fullName: string;
  role: Role;
  streak: number;
  points: number;
  /** Câte activități (și favoruri) a finalizat. */
  completed: number;
  friends: number;
  memberSince: string | null;
  lastActiveOn: string | null;
  relation: Relation;
};

/** Ce vede oricine din comunitate despre o activitate trimisă acolo. */
export type ActivityPreview = {
  id: number;
  title: string;
  category: Category;
  dueDate: string;
  isRecurring: boolean;
  requiresLocation: boolean;
  status: TaskStatus;
  ownerUsername: string;
  ownerName: string;
  memberCount: number;
  maxMembers: number;
  full: boolean;
  myStatus: 'OWNER' | 'MEMBER' | 'INVITED' | 'REQUESTED' | 'DECLINED' | 'NONE';
  canJoin: boolean;
};

/** Un chat de activitate din lista de chaturi (Social → Chat). */
export type ActivityChat = {
  taskId: number;
  title: string;
  category: Category;
  status: TaskStatus;
  memberCount: number;
  messageCount: number;
  readOnly: boolean;
  closesAt: string | null;
  lastMessage: { id: number; text: string; username: string; fullName: string; createdAt: string; mine: boolean } | null;
};

export type LeaderboardEntry = {
  username: string;
  fullName: string;
  streak: number;
  points: number;
};

export type AdminUser = User & { createdAt: string };

/** Recap lunar: activități finalizate pe categorii (GET /api/tasks/recap?month=YYYY-MM). */
export type Recap = {
  month: string;
  total: number;
  previousTotal: number;
  categories: { category: Category; count: number }[];
};

export type Coordinates = { latitude: number; longitude: number };

/** Centrul Brașovului, folosit când nu avem încă locația utilizatorului. */
export const DEFAULT_COORDS: Coordinates = { latitude: 45.6525, longitude: 25.5888 };

export type FavorStatus = 'REQUESTED' | 'ACCEPTED' | 'DECLINED' | 'REFUSED' | 'SUBMITTED' | 'COMPLETED' | 'EXPIRED' | 'CANCELED';
export const OPEN_FAVOR_STATUSES: readonly FavorStatus[] = ['REQUESTED', 'ACCEPTED', 'SUBMITTED'];

/** Un favor cerut unui prieten (role = REQUESTER) sau cerut mie (role = DOER). */
export type Favor = {
  id: number;
  role: 'REQUESTER' | 'DOER';
  friend: { username: string; fullName: string };
  title: string;
  details: string;
  category: Category;
  dueDate: string;
  latitude: number;
  longitude: number;
  radius: number;
  status: FavorStatus;
  /** La cerere, cel rugat datora deja un favor: poate refuza doar ca „nerezonabil”. */
  obligated: boolean;
  hasPhoto: boolean;
  reviewNote: string | null;
  createdAt: string;
  submittedAt: string | null;
  completedAt: string | null;
  photoTakenAt: string | null;
};

/** Balanța cu un prieten: cine îi datorează cui un favor („pasă ca la tenis”). */
export type FavorBalance = {
  username: string;
  fullName: string;
  balance: 'EVEN' | 'I_OWE' | 'THEY_OWE';
  openFavorId: number | null;
};

export type FavorList = { favors: Favor[]; balances: FavorBalance[] };

export type FavorInput = {
  friend: string;
  title: string;
  details: string;
  category: Category;
  dueDate: string;
  latitude: number;
  longitude: number;
  radius: number;
};

/** Favorurile la care trebuie să fac eu ceva: să răspund, să fac poza sau să aprob poza. */
export const favorNeedsMe = (favor: Favor) =>
  (favor.role === 'DOER' && (favor.status === 'REQUESTED' || favor.status === 'ACCEPTED'))
  || (favor.role === 'REQUESTER' && favor.status === 'SUBMITTED');
