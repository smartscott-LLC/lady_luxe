import Link from "next/link";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import ReactMarkdown from "react-markdown";
import styles from "./post.module.css";

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export function generateStaticParams() {
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ slug: f.replace(/\.md$/, "") }));
}

function loadPost(slug: string) {
  const file = path.join(CONTENT_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  const { data, content } = matter(raw);
  return { title: data.title ?? "", category: data.category ?? "", metaDescription: data.metaDescription ?? "", cover: data.cover ?? "", date: data.date ?? "", content };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Record<string, any>> {
  const { slug } = await params;
  const post = loadPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} — Lady Luxe`,
    description: post.metaDescription,
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = loadPost(slug);
  if (!post) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <h1 className={styles.title}>This page has slipped away…</h1>
          <Link href="/blog" className={styles.back}>← The Journal</Link>
        </div>
      </main>
    );
  }
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        {post.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.heroArt} src={post.cover} alt="" />
        )}
        <p className={styles.category}>{post.category}</p>
        <h1 className={styles.title}>{post.title}</h1>
        <div className={styles.prose}>
          <ReactMarkdown>{post.content}</ReactMarkdown>
        </div>
        <Link href="/blog" className={styles.back}>← The Journal</Link>
      </div>
    </main>
  );
}
