/**
 * Built-in "How to use OleoQ" guide – the knowledge the AI assistant answers from when a tenant
 * has not written its own (Configuration → AI assistant). Written from docs/modules/*.md and the
 * sidebar (src/components/layout/nav-config.ts), 30 Oct 2026.
 */
export const DEFAULT_ASSISTANT_KNOWLEDGE = String.raw`# How to use OleoQ

## About OleoQ
OleoQ is your company's health, safety and environment (EHS) system. In one place you can read and acknowledge company documents, complete response forms, report incidents, assess risks, follow up actions and check which laws apply to your company.

What you see depends on your role and your site. Your company may not use every area described here. **If you can't see a menu or button, you probably don't have access – ask your administrator.**

## The screen layout
- **Sidebar (left)**: **Home**, **My work** and **Favourites** at the top, then one section per area your company uses: **Documents**, **Incidents**, **Risk**, **Law**, **Simplified law**, **Actions** and (for administrators) **Configuration**. Click a section name to open or close it.
- On a computer the sidebar folds to a strip of icons after you pick a page. Click the **Toggle Sidebar** button at the top left (or press Ctrl+B) to open it again.
- **Top bar (right)**, from left to right:
  - **☆ star** – add the page to your favourites (only shown on pages that can be favourites).
  - **Online / Offline** indicator with a number when something is waiting to be sent – click it to see the list and press **Sync**.
  - **Bell** – your notifications.
  - **Your initials** – your account menu: name, e-mail, roles, job title, **Dark mode / Light mode** and **Sign out**.
- **On a phone** there is a bar at the bottom: **Home** · **My work** · **Report** (report an incident; people who can't report incidents see **Documents** instead) · **Menu** (opens the full menu, including Favourites).
- **✦ button (bottom right)** – opens this help assistant. Ask how to do something in OleoQ; the conversation stays while you move between pages and is cleared when you refresh the page or sign out. It is not saved anywhere.
- Dates are shown like "12 Mar 2026". Lists are split into pages – use the page buttons under the list.

## Signing in and out
1. Go to the sign-in page and enter your work e-mail and password.
2. To sign out, click your initials at the top right and choose **Sign out**.
- There is no "forgot password" link. If you forgot your password or are locked out, ask your administrator – they set a temporary password for you in Configuration → Users.
- If you saved work offline, press **Sync** before signing out.

## Home and My work
**Home** ([Home](/dashboard)) greets you and shows summaries for the areas your company uses: your top work items, incident numbers, risk numbers, your actions, law compliance, your documents to acknowledge and document progress. Buttons at the top open **My work** and **Report incident** (or **My documents**). Click a number or card to open the matching list.

**My work** ([My work](/my-work)) is one inbox of everything assigned to you, from every area: documents to acknowledge, response forms to complete, investigations, incident actions and effectiveness reviews, risk reviews and tasks, your actions, law checks and tasks, and Simplified law actions.
- Items are grouped as **Overdue** (past the due date – deal with these first), **Due this week** (today and the next six days) and **Later**.
- Click an item to open it and do the work. It disappears from My work when it is done.
- "You're all caught up" means nothing is waiting for you.

## Documents
Menu: **Documents → My Documents** ([My Documents](/documents)), **My Response Forms** ([My Response Forms](/documents/surveys)) and **Document Library** ([Document Library](/documents/manage), for managers and people who follow acknowledgements).

### Read and acknowledge a document
1. Open **Documents → My Documents**. The tab **Action required** lists what you still have to do.
2. Click the document. Its page shows the file, its details and a checklist.
3. Click **Open** to read the file (or **Download** to save it).
4. Tick the statement (for example "I have read and understood…"). It can only be ticked after you have opened the file.
5. Click **Acknowledge**. You see "Thank you – your acknowledgement has been recorded."
- If the document has a response form, the checklist adds a step: click **Complete the response form** (see Response forms below).
- Statuses on your list: **Acknowledgement required** (to do), **Overdue** (past the deadline), **Acknowledged on 12 Mar 2026** (done), **For information** (nothing to confirm), **Acknowledgement pending sync** (saved offline – press Sync when online).
- Outstanding documents send you reminders, and once overdue for a set number of days your manager or HR may be told.

### Find a document
- In **My Documents**, use the tabs **All**, **Action required** and **Acknowledged**, the search box ("Search documents or tags") and the **Tag** filter.
- In **Document Library** (managers), use the search box (name, reference, category or tag) and the filters for **category**, **tag** and **status** (Active – published and drafts – Published, Drafts, Archived or All statuses).

### Upload a new document (managers)
Who: people with document management access.
1. Open **Documents → Document Library** (or My Documents) and click **Upload document** ([Upload document](/documents/manage/new)).
2. **File** – drop or choose the file. Any file type works; PDFs and images can be previewed in the browser. The default size limit is 10 MB (your company may change it).
3. **Details** – **Title** (required), **Reference code** (optional, e.g. HR-POL-001), **Category**, **Tags** (words that group documents, e.g. "Fire safety"; type a new one to create it) and **Description**.
4. **Who should have access?** – choose **All employees**, or combine roles, business units, sites, locations, departments and named employees. Anyone matching at least one audience sees the document.
5. **Acknowledgement** – switch on **Acknowledgement required** if people must confirm they read it, then set **Due within** (days), **Remind every** (days), **Escalate after** (days overdue) and **Escalate to**.
6. Click **Save as draft** (nobody sees it yet) or **Publish now** (everyone in the audience is notified).

### Edit a document's details, audience or acknowledgement
1. Open **Document Library** and click the document.
2. On the **Overview** tab change the details, the **Audience** or the **Acknowledgement** settings.
3. Click **Save changes**. Newly included people are notified.

### Upload a new version
1. Open the document in **Document Library** and go to the **Versions** tab.
2. Click **Upload new version**, choose the file and fill in **What changed?**.
3. If acknowledgement is on, tick **Employees must acknowledge this version again** when everyone must confirm again (leave it off for small corrections – earlier acknowledgements keep counting).
4. Click **Issue version N**. Earlier versions stay in the history; employees only see the current one.

### Publish, archive and restore
On the document page (Document Library):
- **Publish** – for drafts; everyone in the audience is notified.
- **Archive** – employees no longer see it; versions, acknowledgements and history are kept.
- **Restore** – brings an archived document back.
- **View as employee** – shows the document as readers see it.
- Document statuses: **Draft** (not visible to employees), **Published** (live), **Archived** (hidden, kept).

### Follow acknowledgements (managers)
1. Open the document in **Document Library** and go to the **Acknowledgements** tab.
2. Switch between **Outstanding**, **Overdue** and **Acknowledged** to see who has and hasn't confirmed, with reminders sent.
3. Download **Audit trail (CSV)** or **Outstanding (CSV)** for a spreadsheet.
- The library banner counts documents **To do** (someone still has to acknowledge), **Overdue** and the total **Documents**.
- The **History** tab is the tamper-evident record of everything done to the document.

### Response forms
A response form is a short questionnaire (for example an induction check or feedback form), sometimes with a file to read first.

**Complete a response form**
1. Open **Documents → My Response Forms**. Use the tabs **All**, **To complete** and **Completed**, or search.
2. Click the form. If it has a file, open it first.
3. Click **Complete the response form**, answer the questions and click **Send answers**.
4. If the form allows it, tick **Answer anonymously** – your name is then not stored with your answers. Answers can't be changed after sending.
- Statuses: **To complete**, **Overdue**, **Optional** (not required), **Completed**, **Closed** (no longer accepting answers).

**Create a response form (managers)**
1. Click **Create response form** on **Document Library** or **My Response Forms** ([Create response form](/documents/surveys/new)).
2. **Response form questions** – give it a title, add questions (**Text answer**, **One choice** or **Several choices**) or use **Start from an example**. Set **Everyone must complete it** and **Complete within** (days) if it is required, and **Let people answer anonymously** (on by default).
3. **File** – optional; what people read before answering.
4. **Who should have access?** – the audience, as for documents.
5. **Acknowledgement** – off by default; only possible with a file.
6. Click **Save as draft** or **Publish now**.

**See the answers (managers)**
1. Open **Document Library → Response forms** tab and click the form.
2. On the **Response form** tab see **Results** and **Who has completed it**. Use **Send reminder** for required forms, and **Export CSV** to download the answers.
- Questions can't be changed after the first answer. Use **Close** / **Reopen** or replace the form with a new one (the old one and its results are kept under previous response forms).
- Anonymous answers only appear in results once there are at least 3 of them, to protect people's privacy.

## Incidents
Menu: **Incidents → Overview** ([Incidents overview](/incidents)), **Report incident** ([Report an incident](/incidents/new)), **Incidents** (the register, [Incidents register](/incidents/register)), **Actions** ([Incident actions](/incidents/actions)) and **Reports** ([Incident reports](/incidents/reports)).

### Report an incident
Who: everyone allowed to report incidents (most people).
1. Click **Incidents → Report incident** (on a phone: **Report** in the bottom bar; on Home: **Report incident**).
2. **Step 1 – Type of event**: tap the card for the type of event. You can tick **Report anonymously** here.
3. **Step 2 – What & where**: **Subtype** (if asked), **Incident title**, **Date and time of event**, **Severity** (Minor, Major or Critical), **Department**, **Precise location**, **Shift**, **Investigation target date**, **What happened?**, plus any extra questions for this type.
4. **Step 3 – People & first aid**: **Add a person** for everyone involved (type "Unknown" if you don't know the name), with person type, involvement (Injured, Witness, Other) and injury details. Add **Immediate action taken**, **First aid, treatment and outcome** and **Add photos or files**.
5. **Step 4 – Review & submit**: check everything (each **Change** link jumps back to that step), choose **Who should investigate?** if asked, optionally **Also let these people know**, and tick **Confidential** if the details should be restricted.
6. Click **Submit report**. You get a reference number such as INC-2026-0001.
- **Save draft** keeps an unfinished report; finish it later from the Incidents overview or register, then **Submit report**.
- To change the type, go back to step 1 – your other answers are kept.

### Anonymous reports
- Tick **Report anonymously** before the report is first saved. It can't be changed afterwards.
- Everyone else sees "Reported by: Anonymous" – administrators too. You can still find and follow your report under Incidents.
- What you write, the people you name and your photos can still point to you. A comment you add shows your name. You won't get progress notifications – check the report yourself.

### Reporting without internet
If you are offline, the buttons read **Save offline** / **Save draft offline**. The report is kept on your device; when you are back online, open the Online/Offline indicator in the top bar and press **Sync**.

### The incident page
Open an incident from the register or from My work. At the top you see the reference, status and ONE main button for the next step; other options are under **More** (**Edit report**, **Archive**, **Restore**, **Reopen**). A progress bar shows Reported → Investigation → Actions → Effectiveness → Closed. If something blocks the next step, a box explains exactly what is missing ("Before this incident can be closed…").
Tabs: **Overview**, **People**, **Investigation**, **Actions**, **Evidence**, **Comments**, **History**.

Incident statuses:
- **Draft** – not submitted yet.
- **Open** – reported, investigation not started.
- **Investigating** – investigation in progress.
- **Action required** – the investigation says actions are needed but none exist yet.
- **Action in progress** – actions are open.
- **Awaiting effectiveness** – actions done, waiting for the effectiveness check.
- **Follow-up required** – an action was not effective; a follow-up action is needed.
- **Ready to close** – everything is done.
- **Closed** – finished (can be reopened).

### Investigate an incident
Who: the assigned investigator or EHS staff allowed to investigate.
1. Open the incident and click **Start investigation**.
2. On the **Investigation** tab fill in the **Investigator**, **Impact**, **Reporting and losses** (absence periods, operating hours lost) and **Decision**: at least one cause, whether actions are required, and the closing decision.
3. Click **Save progress** as you go.
4. Click **Complete investigation** when everything is recorded. **Reopen investigation** is available if it needs changing.

### Actions on an incident
1. On the incident click **Add action** (main button or Actions tab). Fill in **What needs to be done?**, **Owner**, **Due date**, the kind (Corrective or Preventive) and optionally priority, reviewer and planned review date.
2. The owner opens the action (from My work or **Incidents → Actions**). Under **More** they can choose **Mark as in progress** or **Edit plan**. Smaller steps can be added with **Add task** and ticked off with **Done**.
3. When finished, the owner clicks **Complete action**, describes what was done and chooses who will review effectiveness and when.
4. On or after that review date, the reviewer clicks **Record effectiveness** and chooses **Effective** or **Not effective** with a comment.
5. If it was not effective, click **Add follow-up action**.
- Action statuses: **Open**, **In progress**, **Awaiting effectiveness**, **Effective**, **Ineffective**. Priorities: Low, Normal, High, Urgent.
- **Incidents → Actions** has tabs **Actions** and **Tasks**, and **Add action** for an action not linked to a particular incident.

### Close, reopen or archive
1. When the status is **Ready to close**, click **Close incident**, enter a **Closure note** and confirm.
2. To reopen a closed incident, click **Reopen**.
3. **More → Archive** hides an incident (for example a duplicate); **Restore** brings it back.

### Incident register and reports
- **Incidents → Incidents** has tabs **Incidents** and **Investigations**. Search by reference, title or answers; filter by status, type, site and severity. **More filters** adds subtype, department, "Reported by me or assigned to me", archived and sorting. **Export CSV** downloads the list.
- You see incidents in your area, plus any you reported or are assigned to.
- **Incidents → Reports**: **By type**, **By cause**, **Days lost**, **Actions & tasks**, **Incident tracking** and **Trends & prevention** (find repeated incidents and create a preventive action). Reports can be downloaded as CSV or printed.

## Risk
Menu: **Risk → Overview** ([Risk overview](/risk)), **Assessments** ([Assessments](/risk/assessments)), **Objectives & programmes** ([Objectives & programmes](/risk/strategy)), **Tasks** ([Risk tasks](/risk/tasks)) and **Reports** ([Risk reports](/risk/reports)).

### Create a risk assessment
Who: people allowed to create assessments.
1. Click **New assessment** on Risk Overview or Assessments ([New assessment](/risk/assessments/new)).
2. **Scope**: **Risk form** (the type of assessment, e.g. Health & Safety 5×5), **Assessment title**, **Activity description**, **Department**, **Review date**, **Responsible person**, **Approver**, and optionally participants, activity/item, operation mode, work area and people exposed.
3. **Hazards & aspects**: click **Add hazard** (or **Add aspect** for environmental forms) for each one. Describe the activity, the hazard (pick it from the list if your company set one up), the consequence and the controls, then rate it.
4. **Review & decide**: check everything and click **Save draft**, **Submit for approval** or, if you are allowed, **Save & approve**.

### How scoring works
- Matrix forms (5×5 or 3×3): choose **Likelihood** and **Severity** for each hazard; the score is calculated for you.
- FMEA forms: move the sliders for severity, likelihood and detection difficulty.
- Checklist forms: answer Yes / No / N/A.
- The assessment's overall score is its highest hazard score. Bands: **Low**, **Medium**, **High**, **Critical** (checklists: **Satisfactory** or **Action required**).

### Approval, reviews and revisions
- Assessment statuses: **Draft**, **Awaiting approval**, **Approved**, **Archived**.
- The named approver opens the assessment and clicks **Approve**.
- When an approved assessment is due for review it appears in the owner's My work. Open it and click **Record periodic review** (comment and next review date).
- To change an approved assessment, click **Start revision** – it becomes a draft again, then submit it for approval. Earlier revisions are kept under **History & reviews**.
- **More** also offers **Edit assessment**, **Clone as new draft**, **QR label** and **Archive**. An archived assessment can be brought back with **Restore as draft**.
- Tabs: **Overview**, **Scorecard**, **Tasks**, **History & reviews**, **Evidence**, **Comments**.
- **Scan a label** ([Scan](/scan)) opens an assessment from its QR label or its reference.

### Print or save as a document
- **More → Print** opens a printable version and the print dialog.
- **More → Save as document (PDF)** (for people who manage documents) creates a PDF and opens **Upload document** with the file attached and the title filled in. Finish the details and audience, then **Save as draft** or **Publish now**.

### Risk tasks
1. Click **Risk → Tasks → New task**, or **Add task** on an assessment's Tasks tab.
2. Choose the **Kind of task** (Assessment task or Programme task), **Title**, **Responsible person**, **Due date** and **Management programme**. For an assessment task also choose the assessment, the hazard and, if the task should lower the risk, the scoring factor to change.
3. The responsible person opens the task, clicks **Start work**, and later **Complete task** with a comment and date. **Add sub-task** splits big tasks.
- Task statuses: **Open**, **In progress**, **Completed**. Completing a scoring task updates the assessment's score.

### Objectives & programmes
**Risk → Objectives & programmes** has tabs **Objectives**, **Targets** and **Programmes**. Use **New objective**, **New target** (a measurable goal to increase or decrease, with baseline, current and goal values) and **New programme** (the plan that groups the targets and tasks). Programme progress counts its completed tasks.

## Actions
Standalone actions are jobs to do that are not part of an incident or a risk assessment. Menu: **Actions → My Actions** ([My Actions](/actions)) and **Create Action** ([Create Action](/actions/new)).

### Create an action
1. Click **Actions → Create Action**.
2. Fill in **What needs to be done?**, details, **Who will do it?** (you by default), **Due date** (two weeks ahead by default), **Priority** and **Where** (your department by default, or "Whole company"). Answer any extra questions under **More details**.
3. Click **Create action**. The owner is notified.

### Work on an action
1. Open **Actions → My Actions**. Tabs: **All mine**, **Assigned to me**, **Created by me** (managers also see **Everyone's**). Search or filter by status, priority or overdue.
2. Open the action and click **Start work** when you begin.
3. When it is done, click **Complete action**, say what was done and the date. You can also complete it straight away without starting it.
- The person who created the action can edit it, **Cancel action** (with a reason) or **Reopen** it. Managers can do this for actions in their area.
- Statuses: **To do**, **In progress**, **Completed**, **Cancelled**. A red **Overdue** badge shows when the due date has passed.
- When an action becomes overdue, its owner gets a notification. Your company may also send regular reminders.

## Law
Law tracks the laws that apply to each site through **profiles** (a site, its country and what happens there). Menu: **Law → Overview** ([Law overview](/law)), **Laws that apply to us** ([Laws that apply to us](/law/requirements)), **Tasks** ([Law tasks](/law/tasks)), **Law library** ([Law library](/law/library)), **Profiles** ([Law profiles](/law/profiles)) and **Reports** ([Law reports](/law/reports)).
Your company may use Law, Simplified law, or both while it decides which one to keep.

### Check compliance with a requirement
1. Open **Law → Laws that apply to us** and choose the profile. Use the tabs (Applies to us, Doesn't apply, Outside this profile, Everything), search and filters such as "Only mine" or "Needs attention".
2. Click a requirement and click **Check compliance** (or **Finish the check** / **Review the change** / **Review again**).
3. Answer the four questions: why it applies and what controls are in place, how you checked it, who is responsible (and department), and when it should be checked again. A compliance rating is optional.
4. Click **Save**.
- If a requirement doesn't apply, choose **More → This doesn't apply to us** and give a reason.
- **More** also offers **Add a task**, linking a risk assessment or incident, **Report as an incident** and **Raise a corrective action**.
- Statuses: **Not checked**, **Partly checked**, **Checked**, **Law changed – review**, **Doesn't apply**.
- **Add a company requirement** adds your own rule that is not in the library.

### Tasks, profiles and updates
- **Law → Tasks** lists law tasks (yours, or everyone's for managers). Open one and click **Mark as done** with a comment.
- **Law → Profiles**: **New profile** to set up a site's profile. When newer legal content is available, the profile shows an update; open it, review the changes and accept them – your checks, evidence and tasks are kept.
- **Law library** lists all legislation; **Reports** shows progress with CSV and print.

## Simplified law
A simpler company-wide legislation register in five steps: choose a category → see its legislation → decide whether it applies to you → check each requirement → track the actions. Menu: **Simplified law → Overview** ([Simplified law overview](/simplified-law)), **All legislation** ([All legislation](/simplified-law/legislation)), **Actions to do** ([Actions to do](/simplified-law/actions)) and **Configuration** (managers).

### Check whether a law applies
Who: people allowed to assess legislation.
1. On **Overview** pick a category and sub-category, or open **All legislation** (filter by jurisdiction and status; repealed laws are hidden by default).
2. Open the law. Tabs: **Overview**, **Applicability**, **Requirements**, **History**. **Official document** opens the official text.
3. Click **Check applicability**. Answer each question Yes or No with a reason – any Yes means the law is likely relevant.
4. Choose **Yes, it applies to us** or **No, it does not apply** (a reason is required) and click **Save decision**.
- Law statuses: **Not checked yet**, **Applies to us**, **Does not apply**.

### Check the requirements
1. On the **Requirements** tab (or click **Check requirements**), open a requirement.
2. Choose **Compliant?**: **Compliant** (give the reason or evidence), **Not compliant** (enter the action, owner and due date), **Not assessed** or **N/A**.
3. Click **Save**. The action owner is told and sees it in My work.

### Actions to do
1. Open **Simplified law → Actions to do** (tabs **Mine** and **Everyone's**).
2. Open your action and click **Mark as done**, describing what was done.
- The requirement then shows **Action done – check again**: someone checks it again and sets it to Compliant.
- Managers add categories, laws, questions and requirements under **Simplified law → Configuration** (tabs Legislation, Categories, Jurisdictions, Settings).

## Favourites
Save shortcuts to the pages you use most, including their tab, filters and search.
1. Open a list page (such as the Incidents register or My Actions) or a create page (such as Report incident or Upload document).
2. Set the tab, filters or search you want.
3. Click the **☆ star** in the top bar. In the dialog choose a title, icon and colour, then click **Add to favourites**.
4. Open your shortcuts from **Favourites** in the sidebar, under My work ([Favourites](/favourites)). On a phone it is in the **Menu**.
- The star only shows on pages that can be saved (list and create pages – not Home, detail pages, Configuration or Law pages). A filled ★ means the page is already a favourite; click it to edit, or to choose **Update to this page now**.
- On a create page, what you typed is kept as a starting point (files are not kept). Only you can see your favourites.
- On the Favourites page use **Add website link** for an outside website. Each tile's **⋯** menu has **Edit title, icon & colour**, **Move earlier**, **Move later** and **Remove**.
- A greyed tile means you no longer have access or the page needs an earlier step – click it to see why.

## Notifications, comments, evidence and history
- **Notifications**: the bell in the top bar shows new work, reminders and changes. Click one to open the record; **Mark all read** clears the count. Notifications are shown inside OleoQ.
- **Comments** tab (incidents, actions, assessments, tasks and more): type in "Write a comment…" and click **Post**. Comments show your name.
- **Evidence** tab: **Add file** to attach a photo or file (default limit 2 MB each) or **Add link** for a web address with a description. Removing evidence is recorded in the history.
- **History** tab: a tamper-proof record of who did what and when. It can't be edited.

## Working offline and the Sync button
- OleoQ works on a phone or tablet with a poor connection. Pages and lists you opened before can still be viewed offline.
- Offline you can: acknowledge a document, complete a response form, add a comment and report an incident. They are saved on your device.
- The top bar shows **Offline** and a number of waiting items. When you are back online, click the indicator and press **Sync**. You see how many items were synced.
- If an item fails, it is marked in the list with the reason; you can retry it or discard it.
- Creating actions, assessments and documents needs a connection.

## Configuration (administrators)
Menu: **Configuration** ([Configuration](/configuration)). A page of cards; you only see the cards you have access to. Most need administrator access for the whole company.
- **Company structure** ([Company structure](/configuration/structure)) – business units, sites, locations and departments. Add, edit, deactivate or reactivate.
- **Users** ([Users](/configuration/users)) – the people directory. **Add person** (name, e-mail, job title, department, manager, first role and a temporary password, or "Directory only"). Open a person to edit them, **Reset password** (sets a temporary password – no e-mail is sent, so tell the person) or **Deactivate**.
- **Roles & permissions** ([Roles & permissions](/configuration/roles)) – what each role can do. **New role**, tick its permissions and save. The assignments view gives a person a role at a level (whole company, business unit, site, location or department) with **Assign role**.
- **Bulk import** ([Bulk import](/configuration/import)) – **Download CSV template**, fill it in, upload it, review the errors, then import structure, users and lists in one go.
- **Form Builder** ([Form Builder](/configuration/forms)) – questionnaires for incident reports, investigations, risk assessments, actions and law checks. **New form**, add questions, **Save draft**, then **Publish** (forms are only used once published).
- **Scheduled jobs** ([Scheduled jobs](/configuration/jobs)) – automatic reminders, escalations and digests. **New job**, choose what it covers and when; **Test** shows who would be reminded without sending; **Run now** sends immediately.
- **Incident settings** ([Incident settings](/configuration/incidents)) – tabs Types & subtypes (**Add type**, rename, choose forms), Causes, Reportees, Export columns and Site questions.
- **Risk matrix & review rules** ([Risk matrix](/configuration/risk)) – the Medium / High / Critical values, review frequency, notice days and sites of each risk form, plus each form's hazard list (the choices in the Hazard field).
- **Law content & settings** ([Law content & settings](/configuration/law)) – install legal content updates and set up the Non Compliance incident type.
- **Simplified law configuration** – lives in its own menu: **Simplified law → Configuration** (categories, laws, jurisdictions, settings).
- **Lists & categories** ([Lists & categories](/configuration/lists)) – pick-lists such as document categories, causes and shifts. Add, rename, reorder, deactivate.
- **Reference numbers** ([Reference numbers](/configuration/numbering)) – prefixes and formats such as INC-2026-0001.
- **Branding** ([Branding](/configuration/branding)) – logo, company name and colours, with a live preview. **Save branding**.
- **System settings** ([System settings](/configuration/settings)) – time zone, upload limits and acknowledgement defaults.
- **Audit log** ([Audit log](/configuration/audit-log)) – the signed history of every change.
- **Subscription** ([Subscription](/configuration/subscription)) – your plan and enabled areas.
- **AI assistant** ([AI assistant](/configuration/assistant)) – the help text this assistant answers from. Administrators can replace this built-in guide with your company's own instructions, contacts and rules.

## Troubleshooting and FAQ
**I can't see a menu, page or button.** Your role or site doesn't give you access, or your company doesn't use that area. Ask your administrator.

**A record says "not found" or "access denied".** It is outside your area, has been archived, or you don't have access. Ask the record's owner or your manager.

**I forgot my password.** There is no self-service reset. Ask your administrator to set a temporary password in Configuration → Users → **Reset password**. It can take up to 5 minutes to apply on other devices.

**I see "This was changed by someone else – reload to see their changes."** Someone saved the same record while you were editing. Your typing is kept on screen: copy what you need, reload the page, and apply your change again.

**My upload failed.** Check the file size (by default 10 MB for documents, 2 MB for evidence) and your connection, then try again – the rest of the form is kept. Ask your administrator if you need a bigger limit.

**I'm working without internet.** Keep going: acknowledgements, response forms, comments and incident reports are saved on your device. Press **Sync** in the top bar when you are back online.

**My name, job title, department or site is wrong.** You can't change these yourself. Ask your administrator to update you in Configuration → Users – your site and department decide which documents and records you see.

**I don't see a document I was told to read.** It may not be published yet, or you are not in its audience. Ask the document owner.

**Why can't I submit, approve or close something?** The page lists what is missing in a box above the tabs (for example "Enter a closure note"). Complete those items and try again.

**Can I change my answers to a response form?** No – answers are final once sent.

**How do I switch to dark mode?** Click your initials at the top right and choose **Dark mode** (or **Light mode**).

**Who do I contact for help?** Your manager for your work, and your company's OleoQ administrator for access, passwords and setup.
`;
