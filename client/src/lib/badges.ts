import { useAuth } from './auth';
import { taskChatKey, useSeenChats } from './chatSeen';
import { useActivityChats, useFavors, useFriends, useTasks } from './queries';
import { favorNeedsMe } from './types';

/**
 * Numerele de pe tab-uri: ce așteaptă după mine.
 * - Social: cereri de prietenie primite, favoruri la care trebuie să răspund și chaturi de activitate cu mesaje noi
 *   (chatul comunității nu intră: ar avea mereu ceva nou și numărul și-ar pierde rostul).
 * - Activități: invitații primite și cereri de participare la activitățile mele.
 */
export function useBadges(): { social: number; tasks: number } {
  const { status } = useAuth();
  const friends = useFriends();
  const favors = useFavors();
  const tasks = useTasks();
  const chats = useActivityChats();
  const { seen } = useSeenChats();
  if (status !== 'signedIn') return { social: 0, tasks: 0 };

  const friendRequests = (friends.data ?? []).filter((friend) => friend.status === 'INCOMING').length;
  const favorsWaiting = (favors.data?.favors ?? []).filter(favorNeedsMe).length;
  const unreadChats = (chats.data ?? []).filter((chat) => chat.lastMessage && !chat.lastMessage.mine
    && chat.lastMessage.id > (seen[taskChatKey(chat.taskId)] ?? 0)).length;
  const invites = (tasks.data ?? []).filter((task) => task.myStatus === 'INVITED').length;
  const joinRequests = (tasks.data ?? []).filter((task) => task.isOwner)
    .reduce((total, task) => total + (task.joinRequests?.length ?? 0), 0);
  return { social: friendRequests + favorsWaiting + unreadChats, tasks: invites + joinRequests };
}
