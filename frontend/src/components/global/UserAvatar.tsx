// Banani ships this as a built-in global with no source in the design
// export. This is a simple stand-in: a deterministic DiceBear placeholder
// avatar derived from the person's props, so the same "person" always
// renders the same picture — unless `src` is given (a real uploaded photo,
// e.g. User.avatarUrl), which takes priority over the generated one.
export interface UserAvatarProps {
  gender?: string;
  ageGroup?: string;
  heritage?: string;
  index?: number;
  className?: string;
  src?: string | null;
}

export default function UserAvatar({
  gender = '',
  ageGroup = '',
  heritage = '',
  index = 0,
  className = 'w-8 h-8',
  src,
}: UserAvatarProps) {
  const seed = [gender, ageGroup, heritage, index].filter(Boolean).join('-') || 'default';
  const fallbackSrc = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

  return (
    <img src={src || fallbackSrc} alt="" className={`rounded-full object-cover ${className}`} />
  );
}
