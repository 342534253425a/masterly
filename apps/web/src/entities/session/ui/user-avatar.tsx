import type { User } from '@masterly/contracts';
import { Avatar, type AvatarProps } from '@/shared/ui';

export function UserAvatar({ user, size = 'md', className }: { user: Pick<User, 'initials' | 'hue' | 'name'>; size?: AvatarProps['size']; className?: string }) {
  return <Avatar initials={user.initials} hue={user.hue} size={size} className={className} label={user.name} />;
}
