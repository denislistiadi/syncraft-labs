import layoutStyles from "./styles/Layout.module.css";
import headerStyles from "./styles/Header.module.css";
import cardStyles from "./styles/Card.module.css";
import skeletonStyles from "./styles/Skeleton.module.css";

export function PlaygroundFallback() {
  return (
    <div className={layoutStyles.container}>
      <div className={layoutStyles.mainColumn}>
        <header className={headerStyles.header}>
          <div>
            <h2 className={headerStyles.headerTitle}>Tasks</h2>
            <p className={headerStyles.headerSubtitle}>Loading playground...</p>
          </div>
        </header>
        <main className={cardStyles.card}>
          <div className={skeletonStyles.skeleton}>
            {[1, 2, 3].map((i: number) => (
              <div key={i} className={skeletonStyles.skeletonRow}>
                <div className={skeletonStyles.skeletonCheckbox} />
                <div className={skeletonStyles.skeletonText} />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
