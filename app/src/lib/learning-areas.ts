/** Navigation groups grounded in the user's stated interests. They do not rank
 * topics or impose prerequisites. Unmatched topics remain available. */
export const LEARNING_AREAS = [
  { id: "computing", label: "Computer science", description: "CS theory, distributed systems, mathematics, Rust and software craft", match: /comput|complexity|information theory|distributed|rust|ownership|mathemat|memory management|software|\bweb\b|\bC\b/i },
  { id: "systems", label: "AI, security & homelab", description: "AI engineering, devops, self-hosting and cybersecurity", match: /\bAI\b|artificial intelligence|machine learning|devops|self.host|homelab|cyber|secur|pentest|OSCP/i },
  { id: "creative", label: "Design & game worlds", description: "Typography, interaction, game feel, narrative and worldbuilding", match: /design|typography|interface|game|narrative|stories|worldbuilding|dialogue|Godot/i },
  { id: "ideas", label: "Mind & philosophy", description: "Reasoning, learning, memory and political philosophy", match: /philosoph|reason|fallac|argument|cognitive|learning and memory|Hegel|infrapolitic/i },
  { id: "nature", label: "Sustainable futures", description: "Solarpunk, sustainability and biomimicry", match: /solarpunk|sustainab|biomimic|permacomput|ecolog/i },
  { id: "japanese", label: "Japanese", description: "Language practice and the JLPT path", match: /Japanese|JLPT|kanji|hiragana|katakana/i },
  { id: "business", label: "Business & markets", description: "Entrepreneurship, indie hacking and quantitative trading", match: /business|entrepreneur|indie.hack|trading|quantitative|finance|markets/i },
  { id: "personal", label: "Life & personal interests", description: "Training, triathlon, etiquette and other curiosities", match: /training|triathlon|fitness|etiquette|suits|accessories/i },
] as const;

export function topicInArea(topic: string, areaId: string): boolean {
  const matches = LEARNING_AREAS.filter((area) => area.match.test(topic));
  // The final group also keeps new, unclassified interests reachable.
  return matches.some((area) => area.id === areaId) || (matches.length === 0 && areaId === "personal");
}

export function topicLabel(topic: string): string {
  const label = topic.replace(/^I want to (?:understand |learn |internalize |reliably )?/i, "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
