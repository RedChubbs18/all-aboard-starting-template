import OfferClient from "./offer-client";

export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OfferClient token={token} />;
}
