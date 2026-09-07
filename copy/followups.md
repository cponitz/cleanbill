# Follow-up messages (agent drafts these; human approves in shadow mode)

Tone: plain, short, no urgency tricks, always restate "you can file free yourself" once per thread.

## needs_dl_update — ID address doesn't match the property
Subject: One quick step before we can file — your license address

Hi {{first_name}}, we reviewed your ID and the address on it ({{dl_address}}) doesn't match {{situs_address}}. TCAD requires them to match before it will approve a homestead exemption.

Fastest fix: update your address with the Texas DPS online — usually about 10 minutes — at https://www.dps.texas.gov/section/driver-license/change-your-address. When you have the confirmation (a printed temporary card or the updated card), reply here with a photo and we'll finish your application the same day.

Your claim is on hold until then — nothing has been filed. The {{earliest_year}} refund year stays available until {{deadline_text}}.

(You can also file yourself for free at traviscad.org once your address is updated.)

## ready_to_submit — packet prepared, ask for the "go"
Subject: Your homestead application is ready to review

Hi {{first_name}}, attached is your completed Form 50-114 for {{situs_address}}, including the late-application request for {{refund_years_text}}. Please check your name, address, and the dates.

Reply **"go"** and we'll submit it to the Travis Central Appraisal District today, or tell us what to change. After submission, TCAD typically takes 30–90 days; we'll keep you posted.

## filed — confirmation
Subject: Submitted to TCAD — what happens next

Your application for {{situs_address}} was submitted to the Travis Central Appraisal District on {{submitted_date}} via {{channel}}. They may take up to 90 days. If they ask for anything else, we'll handle it and let you know. Nothing is owed until a refund is actually issued.

## approved — refund observed / invoice
Subject: Your exemption was approved — refund details and our invoice

Good news: TCAD approved your homestead exemption for {{tax_years}}. The Travis County Tax Office shows refunds of {{refund_lines}} (total {{refund_total}}). Per our agreement, our fee is 25%: {{fee_amount}}, due {{due_date}}. {{card_line}}

Your bill going forward should be about {{forward_display}} lower each year — that part is all yours.

## denied — options
Subject: TCAD's decision on your application, and your options

TCAD did not approve your application; the stated reason is: "{{denial_reason}}". You owe nothing. Here are the options, in order of simplicity: (1) fix the issue and refile — most denials are document issues; (2) protest the denial to the Appraisal Review Board within 30 days of the notice — we can refer you to a registered property tax consultant or attorney for that. Tell us which you'd like.

## inbound — "is this a scam?"
Subject: Re: your question

Fair question — this category has real scammers in it. Three things you can verify yourself: (1) look up {{situs_address}} at traviscad.org/property-search — you'll see no "HS" exemption listed; (2) TCAD's own site confirms late homestead applications can be filed up to two years after the delinquency date; (3) you can file it yourself for free, and our fee is only charged if the Tax Office actually issues a refund. We're a private company in Austin, not a government agency. Happy to answer anything else.
