/**
 * Static and container exports zip the build's files off disk. A serverless
 * host keeps those only in one instance's /tmp, so there the UI offers the
 * Next.js export alone (it renders from the database). Set at build time.
 */
export const DISK_EXPORTS = process.env.NEXT_PUBLIC_DISK_EXPORTS === "1";
