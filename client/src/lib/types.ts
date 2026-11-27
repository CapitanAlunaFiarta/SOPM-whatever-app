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
  confirmedCount: number;
  chat: TaskChat;
};

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

export type ChatMessage = {
  id: number;
  senderUsername: string;
  senderName: string;
  senderRole: Role;
  text: string;
  createdAt: string;
};

export type Friend = {
  username: string;
  fullName: string;
  streak: number;
  points: number;
  direction: 'incoming' | 'outgoing' | 'mutual';
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
