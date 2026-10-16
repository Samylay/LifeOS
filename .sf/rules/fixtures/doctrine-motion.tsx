// Doctrine fixture (no real past mistake in LifeOS for these rules yet).
export const Slow = () => <div className="opacity-0 duration-700" />;
export const Grow = () => <div className="transition-[height] duration-200" />;
export const Pop = () => <div className="data-[state=open]:scale-100 scale-0" />;
