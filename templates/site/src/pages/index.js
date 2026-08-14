import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

// Edit these cards freely — guidesmith never rewrites this file after `init`.
const HIGHLIGHTS = [
  {
    title: 'Start here',
    body: 'New to the app? The getting-started guide walks you through the first task end to end.',
    to: '/docs/intro',
    cta: 'Read the intro',
  },
  {
    title: 'Every step, screenshotted',
    body: 'Each instruction is paired with a real screenshot of the current app, with the control you need outlined.',
    to: '/docs/intro',
    cta: 'Browse guides',
  },
  {
    title: 'Always current',
    body: 'Screenshots are re-captured from the live app, so the pictures match what you actually see.',
    to: '/docs/intro',
    cta: 'See the guides',
  },
];

function Hero() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={styles.hero}>
      <div className="container">
        <Heading as="h1" className={styles.heroTitle}>
          {siteConfig.title}
        </Heading>
        <p className={styles.heroSubtitle}>{siteConfig.tagline}</p>
        <div className={styles.heroActions}>
          <Link className="button button--primary button--lg" to="/docs/intro">
            Open the user guides
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <Hero />
      <main>
        <section className={styles.cards}>
          <div className="container">
            <div className="row">
              {HIGHLIGHTS.map((item) => (
                <div key={item.title} className={clsx('col col--4')}>
                  <div className={styles.card}>
                    <Heading as="h3">{item.title}</Heading>
                    <p>{item.body}</p>
                    <Link to={item.to}>{item.cta} →</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
