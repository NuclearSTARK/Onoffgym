export const communityKey=post=>(post.serverNotice?'notice:':'post:')+post.id;
export function unreadCommunityPosts(posts,reads={},viewerId){return posts.filter(p=>p.authorId!==viewerId&&p.author_id!==viewerId&&!reads[communityKey(p)]);}
