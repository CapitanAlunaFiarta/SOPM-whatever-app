import { useAuth } from './auth';
import { taskChatKey, useSeenChats } from './chatSeen';
import { useActivityChats, useConversations, useFavors, useFriends, useTasks } from './queries';
import { favorNeedsMe } from './types';

/**
 * Numerele de pe tab-uri: ce așteaptă după mine.
 * - Social: cereri de prietenie primite, favoruri la care trebuie să răspund, chaturi de activitate cu mesaje noi și
 *   conversații private cu mesaje necitite (chatul comunității nu intră: ar avea mereu ceva nou și numărul și-ar
 *   pierde rostul).
 * - Activități: invitații primite și cereri de participare la activitățile mele.
 */
export function useBadges(): { social: number; tasks: number } {
  const { status } = useAuth();
  const friends = useFriends();
  const favors = useFavors();
  const tasks = useTasks();
  const chats = useActivityChats();
  const conversations = useConversations();
  const { seen } = useSeenChats();
  if (status !== 'signedIn') return { social: 0, tasks: 0 };

  const friendRequests = (friends.data ?? []).filter((friend) => friend.status === 'INCOMING').length;
  const favorsWaiting = (favors.data?.favors ?? []).filter(favorNeedsMe).length;
  const unreadChats = (chats.data ?? []).filter((chat) => chat.lastMessage && !chat.lastMessage.mine
    && chat.lastMessage.id > (seen[taskChatKey(chat.taskId)] ?? 0)).length;
  const unreadDirect = (conversations.data ?? []).filter((conversation) => conversation.unread > 0).length;
  const invites = (tasks.data ?? []).filter((task) => task.myStatus === 'INVITED').length;
  const joinRequests = (tasks.data ?? []).filter((task) => task.isOwner)
    .reduce((total, task) => total + (task.joinRequests?.length ?? 0), 0);
  return { social: friendRequests + favorsWaiting + unreadChats + unreadDirect, tasks: invites + joinRequests };
}
