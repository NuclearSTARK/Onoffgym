const encouragement={
 '상위권':['쌓아온 노력이 빛나요.','다음 목표에 도전해보세요!'],
 '중위권':['꾸준히 성장하고 있어요.','한 걸음 더 나아가볼까요?'],
 '하위권':['오늘의 기록부터,','나의 속도로 차근차근!']
};
export function comparisonHeading(standing){const lines=encouragement[standing.group]||[];return `<div class="rm-standing-heading"><strong class="rm-standing-label">${standing.label.replace(/^중위권 · /,'')}</strong><span class="mini-badge standing-badge">${standing.group}</span></div><p class="rm-encouragement">${lines.map(line=>`<span>${line}</span>`).join('')}</p>`;}
