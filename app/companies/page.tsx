import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { companyBoardUrl, companyKey } from "@/lib/companies/catalog";
import { listFollowedCompanies } from "@/lib/companies/following";
import { INDUSTRY_LABELS, isIndustryId } from "@/lib/companies/industries";
import { SEARCH_HISTORY_LIMIT } from "@/lib/companies/searchHistory";
import { suggestCompanies } from "@/lib/companies/suggestions";
import { CompaniesPanel } from "@/components/CompaniesPanel";

export const dynamic = "force-dynamic";

const SEARCHES_SHOWN = 10;

export default async function CompaniesPage() {
  const userId = await requireUserIdForPage();

  const [interests, searches, hidden, followed] = await Promise.all([
    prisma.industryInterest.findMany({ where: { userId }, select: { industry: true } }),
    prisma.searchHistoryEntry.findMany({
      where: { userId },
      orderBy: { searchedAt: "desc" },
      select: { id: true, keywords: true, location: true },
    }),
    prisma.hiddenCompanySuggestion.findMany({ where: { userId }, select: { platform: true, token: true } }),
    listFollowedCompanies(userId),
  ]);

  const industries = interests.map((interest) => interest.industry).filter(isIndustryId);
  const suggestions = suggestCompanies({
    industries,
    searches,
    excludedKeys: new Set([...followed.map((company) => company.key), ...hidden.map((entry) => companyKey(entry.platform, entry.token))]),
  });

  return (
    <div>
      <div className="page-heading mb-6">
        <div>
          <h1 className="mb-1 text-2xl font-extrabold text-heading">Companies</h1>
          <p className="page-lede mb-0">
            Many employers post openings only on their own job pages. Follow the ones you like, and Serpo checks their
            pages every time you search. Nothing is followed until you choose it.
          </p>
        </div>
      </div>
      <CompaniesPanel
        industries={industries}
        suggestions={suggestions.map(({ company, reasons }) => ({
          key: companyKey(company.platform, company.token),
          name: company.name,
          platform: company.platform,
          token: company.token,
          boardUrl: companyBoardUrl(company.platform, company.token),
          industryLabels: company.industries.map((id) => INDUSTRY_LABELS[id]),
          reasons,
        }))}
        followed={followed}
        searches={searches.slice(0, SEARCHES_SHOWN)}
        searchCount={searches.length}
        hiddenCount={hidden.length}
        searchLimit={SEARCH_HISTORY_LIMIT}
      />
    </div>
  );
}
