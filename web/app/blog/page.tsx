import { Suspense } from "react";
import Link from "next/link";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import styles from "./blog.module.css";

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

function getAllPosts() {
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  return files
    .map((f) => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, f), "utf-8");
      const { data } = matter(raw);
      return {
        slug: f.replace(/\.md$/, ""),
        title: data.title ?? f,
        category: data.category ?? "Journal",
        metaDescription: data.metaDescription ?? "",
        date: data.date ?? "",
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function PostIndex() {
  const posts = getAllPosts();
  return (
    <div className={styles.list}>
      {posts.map((p) => (
        <Link key={p.slug} href={`/blog/${p.slug}`} className={styles.card}>
          <span className={styles.category}>{p.category}</span>
          <span className={styles.title}>{p.title}</span>
          <span className={styles.excerpt}>{p.metaDescription}</span>
        </Link>
      ))}
    </div>
  );
}

export default function BlogPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>The Lady Luxe Journal</p>
        <h1 className={styles.title}>After Dark</h1>
        <p className={styles.sub}>
          Trends, care rituals, escapades and stories from the maison.
        </p>
        <Suspense fallback={<p className={styles.empty}>Opening the journal…</p>}>
          <PostIndex />
        </Suspense>
      </div>
    </main>
  );
}
