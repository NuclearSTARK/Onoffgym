export const AVATAR_EMOJIS=['🏋️','💪','🔥','⚡','🏃','🚴','🤸','🥇','🏆','🎯','🚀','🌟','😎','😊','🐻','🐯','🦁','🐼','🐰','🦊','🐸','🐵','🐶','🐱','🦄','🐧','🦅','🐬','🌊','🍀','🌈','🍑'];
export const validAvatar=value=>AVATAR_EMOJIS.includes(value);
export const avatarEmoji=value=>validAvatar(value)?value:'🏋️';
