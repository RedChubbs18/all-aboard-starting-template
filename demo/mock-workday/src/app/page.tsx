import Link from "next/link";

export default function Home() {
  return (
    <div className="rounded-lg bg-white p-8 shadow-sm border border-slate-200">
      <h1 className="text-2xl font-semibold">People &amp; Talent Portal</h1>
      <p className="mt-2 text-slate-600">This is a stand-in HR system used to start the MyJourney demo. Candidates arrive through a private offer link.</p>
      <Link href="/recruiter" className="mt-6 inline-block rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800">
        Recruiter console
      </Link>
    </div>
  );
}
