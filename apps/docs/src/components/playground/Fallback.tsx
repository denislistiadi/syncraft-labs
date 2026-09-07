import layout from "./styles/Layout.module.css";
import header from "./styles/Header.module.css";
import card from "./styles/Card.module.css";
import skeleton from "./styles/Skeleton.module.css";
const styles = { ...layout, ...header, ...card, ...skeleton };

export function PlaygroundFallback() {
  return (
    <div className={styles.container}>
      <div className={styles.mainColumn}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.headerTitle}>Tasks</h2>
            <p className={styles.headerSubtitle}>Loading playground…</p>
          </div>
        </header>
        <main className={styles.card}>
          <div className={styles.skeleton}>
            {[1, 2, 3].map((i: number) => (
              <div key={i} className={styles.skeletonRow}>
                <div className={styles.skeletonCheckbox} />
                <div className={styles.skeletonText} />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
