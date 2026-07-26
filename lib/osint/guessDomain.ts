/** Pure guess used only to pre-fill the confirm dialog client-side — never sent to the OSINT route without explicit user confirmation. */
export function guessDomainFromCompany(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
}
