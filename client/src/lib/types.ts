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
  friend: string;
  isOwner: boolean;
  ownerUsername: string;
  ownerName: string;
  lastCompletedOn: string | null;
  completedToday: boolean;
};

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
  friend: string;
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
