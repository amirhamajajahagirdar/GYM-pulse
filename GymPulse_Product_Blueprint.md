# GymPulse

## Smart Gym Presence & Intelligence Platform

> **Product blueprint · Architecture · Database · User journeys · MVP
> roadmap**\
> Version 1.0 · Product planning document · 15 November 2026

------------------------------------------------------------------------

## Document purpose

This document defines the GymPulse product direction and the technical
foundation to use before development begins. It is written as a
responsive Markdown document: headings, short sections, compact tables,
and diagrams are intended to remain readable on both desktop and mobile
screens.

## 1. Product overview

**GymPulse** is a cloud-based, multi-tenant SaaS platform that connects
gym owners, trainers, and members through one system for gym presence,
membership management, live occupancy, and member engagement.

Its central idea:

> Turn every gym visit into useful information that helps members stay
> consistent and helps gyms operate better.

GymPulse is primarily a gym operations and presence platform---not a
workout-generator app.

### The problems it solves

  -----------------------------------------------------------------------
  Gym problem                         GymPulse solution
  ----------------------------------- -----------------------------------
  Paper registers and unreliable      Verified digital check-in and
  attendance records                  check-out

  Confusing membership records and    Centralized membership management
  expiry dates                        

  Members cannot tell how busy the    Live occupancy and crowd trends
  gym is                              

  Members quietly stop attending      Attendance-change alerts and
                                      trainer follow-up

  Owners lack operational insight     Attendance, retention, and
                                      utilization analytics
  -----------------------------------------------------------------------

**Primary customer:** gym owner.\
**Platform users:** owners, trainers, members, and GymPulse Super
Admins.

## 2. Product goals

### Product goal

Build a reliable, easy-to-use platform that lets a gym manage daily
membership and attendance activities digitally.

### Member goal

Make it easier to check in, see membership status, review attendance,
and maintain consistency.

### Business goal

Offer GymPulse as a subscription product that multiple independent gyms
can register for and use, with each gym's data and branding kept
separate.

### Technical goal

Create a secure, maintainable foundation that can later support
real-time updates, advanced analytics, automation, and hardware
integrations.

## 3. Final product decisions

  Area                   Decision
  ---------------------- ----------------------------------------------------
  Product model          Multi-tenant SaaS
  Gym onboarding         Self-registration plus admin review/approval
  Hosting                Cloud-based
  Branding               White-label branding per gym
  Interface              Responsive web application
  Member access          Mobile-first web portal; no app required initially
  Attendance             Dynamic QR-based check-in and check-out
  Backend architecture   Modular monolith
  Frontend               React + TypeScript
  Backend runtime        Node.js + TypeScript + Express
  Database               PostgreSQL
  ORM                    Prisma
  Real-time updates      Socket.IO
  Authentication         Secure server-managed sessions
  Initial deployment     Managed cloud hosting and managed PostgreSQL

### Architecture principle

Start with a **modular monolith**, not microservices. This means one
deployable backend application with clearly separated modules. It is
easier to build, test, deploy, and maintain at the beginning, while
still allowing individual modules to be separated later if scale
requires it.

## 4. Users and permissions

GymPulse has four main roles.

  -----------------------------------------------------------------------
  Role                                Main responsibilities
  ----------------------------------- -----------------------------------
  Super Admin                         Review gym applications, manage
                                      platform accounts and SaaS plans,
                                      support operations

  Gym Owner                           Manage their gym, staff, members,
                                      plans, branding, attendance, and
                                      reports

  Trainer                             View assigned members, attendance,
                                      and permitted progress notes

  Member                              View their own QR pass, membership,
                                      attendance, and gym occupancy
  -----------------------------------------------------------------------

A person may have different roles in different gyms. For example, a
person could be a trainer at one gym and a member at another.

**Authorization rule:** users only access records permitted by their
role and their active gym relationship. The backend must determine the
authorized gym context; it must never blindly trust a `gym_id` sent by
the browser.

## 5. System architecture

### High-level architecture

``` mermaid
flowchart TB
    subgraph CLIENTS["Client applications"]
      OWNER["Gym Owner Dashboard"]
      TRAINER["Trainer Workspace"]
      MEMBER["Member Portal"]
      ADMIN["Super Admin Panel"]
    end

    CLIENTS -->|"HTTPS / REST API"| API["Node.js + Express Backend"]

    subgraph MODULES["Backend modules"]
      AUTH["Authentication & Authorization"]
      GYM["Gym & Branch Management"]
      PEOPLE["Members & Trainers"]
      MEMBERSHIP["Membership & Payments"]
      ATTENDANCE["Presence / QR Engine"]
      ANALYTICS["Analytics & Retention"]
      NOTIFY["Notifications"]
      BRAND["White-label Branding"]
    end

    API --> MODULES
    MODULES --> DB[("PostgreSQL")]
    API <-->|"Live events"| SOCKET["Socket.IO"]
    API --> STORAGE["Object Storage"]
    API --> MONITOR["Logs & Monitoring"]
```

### Request lifecycle

1.  A user opens GymPulse in a browser.
2.  The frontend sends a request to the backend over HTTPS.
3.  The backend authenticates the session.
4.  It checks the user's role and authorized gym/branch context.
5.  It validates the request and applies business rules.
6.  It reads or writes records in PostgreSQL.
7.  For live events, the backend publishes an authorized update to
    connected dashboards.

### Technology stack

  -----------------------------------------------------------------------
  Layer                   Technology              Purpose
  ----------------------- ----------------------- -----------------------
  Frontend                React + TypeScript      Owner, trainer, member,
                                                  and admin interfaces

  Styling                 Tailwind CSS            Responsive interface
                                                  styling

  Backend                 Node.js + Express +     APIs and business logic
                          TypeScript              

  Database                PostgreSQL              Persistent application
                                                  data

  ORM                     Prisma                  Typed database access
                                                  and migrations

  Real-time               Socket.IO               Occupancy and dashboard
                                                  updates

  Authentication          Server-managed sessions Secure login and
                                                  session handling

  QR                      Signed, short-lived     Check-in authorization
                          tokens                  

  File storage            S3-compatible object    Logos and profile
                          storage                 images

  Hosting                 Managed cloud services  Application and
                                                  database deployment
  -----------------------------------------------------------------------

**Keep the first release simple:** do not introduce Kubernetes,
microservices, or Redis until a measured requirement justifies them.

## 6. Multi-tenant and white-label design

GymPulse uses one shared application and database infrastructure for
multiple gyms, while isolating each gym's records.

``` mermaid
flowchart TB
    PLATFORM["GymPulse Platform"]
    PLATFORM --> A["Gym A tenant"]
    PLATFORM --> B["Gym B tenant"]
    PLATFORM --> C["Gym C tenant"]

    A --> A1["Members A"]
    A --> A2["Trainers A"]
    A --> A3["Attendance A"]

    B --> B1["Members B"]
    B --> B2["Trainers B"]
    B --> B3["Attendance B"]

    C --> C1["Members C"]
    C --> C2["Trainers C"]
    C --> C3["Attendance C"]
```

### Tenant isolation

-   Gym-owned records carry a `gym_id` tenant identifier.
-   The backend derives tenant access from the authenticated user's
    authorized gym membership.
-   Database foreign keys and constraints prevent invalid cross-gym
    relationships.
-   PostgreSQL row-level security can provide an additional isolation
    layer.
-   Automated tests must verify that one gym cannot read or modify
    another gym's records.

### White-label branding

Each gym can configure:

-   Gym name and logo.
-   Primary and secondary brand colors.
-   Contact details and address.
-   Branch details.
-   Member-facing portal identity.

Example future addresses:

-   `fitzone.gympulse.in`
-   `ironclub.gympulse.in`

Custom domains can be added later. GymPulse remains the underlying
platform.

## 7. Database design

PostgreSQL is the central source of truth. The tables below describe the
planned domain model; the exact column types, constraints, indexes, and
migrations will be defined during implementation.

### A. Platform and gym tables

  -----------------------------------------------------------------------
  Table                   Important fields        Purpose
  ----------------------- ----------------------- -----------------------
  `users`                 `id`, `name`, `email`,  Login identities
                          `password_hash`         

  `gyms`                  `id`, `name`, `slug`,   Registered gyms
                          `status`, `timezone`    

  `gym_branches`          `id`, `gym_id`, `name`, Gym locations
                          `address`               

  `gym_user_roles`        `id`, `gym_id`,         Roles within a gym
                          `user_id`, `role`       

  `gym_branding`          `gym_id`, `logo_url`,   White-label settings
                          `primary_color`         

  `gym_applications`      `id`, `owner_id`,       Registration and
                          `status`                approval requests
  -----------------------------------------------------------------------

### B. Member and trainer tables

  -----------------------------------------------------------------------
  Table                   Important fields        Purpose
  ----------------------- ----------------------- -----------------------
  `members`               `id`, `gym_id`,         Gym-specific member
                          `user_id`,              profile
                          `member_code`           

  `trainers`              `id`, `gym_id`,         Trainer profile
                          `user_id`               

  `trainer_assignments`   `trainer_id`,           Trainer-member
                          `member_id`             relationships

  `member_notes`          `id`, `member_id`,      Progress and follow-up
                          `trainer_id`, `note`    notes
  -----------------------------------------------------------------------

A member profile may be created by gym staff before the member activates
a login account.

### C. Membership and payment tables

  ------------------------------------------------------------------------
  Table                    Important fields        Purpose
  ------------------------ ----------------------- -----------------------
  `membership_plans`       `id`, `gym_id`, `name`, Gym membership packages
                           `duration`, `price`     

  `member_subscriptions`   `id`, `member_id`,      A member's subscription
                           `plan_id`,              period
                           `start_date`,           
                           `end_date`, `status`    

  `payments`               `id`,                   Gym payment records
                           `subscription_id`,      
                           `amount`, `method`,     
                           `status`                

  `payment_receipts`       `id`, `payment_id`,     Receipt details
                           `receipt_number`        
  ------------------------------------------------------------------------

**Important distinction:** a member's subscription to a gym is not the
same as the gym owner's subscription to GymPulse. They are separate
billing systems.

### D. Attendance tables

  -----------------------------------------------------------------------
  Table                   Important fields        Purpose
  ----------------------- ----------------------- -----------------------
  `qr_credentials`        `id`, `member_id`,      QR credentials
                          `token_hash`,           
                          `expires_at`            

  `attendance_sessions`   `id`, `gym_id`,         Individual gym visits
                          `branch_id`,            
                          `member_id`,            
                          `checked_in_at`,        
                          `checked_out_at`        

  `attendance_events`     `id`, `session_id`,     Entry and exit event
                          `event_type`,           history
                          `created_at`            
  -----------------------------------------------------------------------

An attendance session represents one visit. An open session has an entry
time but no exit time.

Example:

  Member   Entry   Exit           Duration
  -------- ------- -------------- ------------
  Rahul    06:10   07:35          85 minutes
  Aman     07:00   08:20          80 minutes
  Priya    07:15   Still inside   Ongoing

Occupancy is calculated from valid open sessions for a specific branch.

### E. System and intelligence tables

  Table                        Purpose
  ---------------------------- ---------------------------------------
  `notifications`              Expiry and attendance reminders
  `notification_preferences`   Member notification settings
  `audit_logs`                 Important administrative actions
  `gympulse_plans`             GymPulse SaaS pricing plans
  `gympulse_subscriptions`     Gym owners' subscriptions to GymPulse
  `system_settings`            Platform-level configuration

### Entity relationship diagram

``` mermaid
erDiagram
    USERS ||--o{ GYM_USER_ROLES : has
    GYMS ||--o{ GYM_USER_ROLES : contains
    GYMS ||--o{ GYM_BRANCHES : operates
    GYMS ||--o{ MEMBERS : manages
    USERS ||--o| MEMBERS : linked_to
    USERS ||--o| TRAINERS : linked_to
    TRAINERS ||--o{ TRAINER_ASSIGNMENTS : assigned
    MEMBERS ||--o{ TRAINER_ASSIGNMENTS : receives
    MEMBERS ||--o{ MEMBER_SUBSCRIPTIONS : purchases
    MEMBERSHIP_PLANS ||--o{ MEMBER_SUBSCRIPTIONS : defines
    MEMBER_SUBSCRIPTIONS ||--o{ PAYMENTS : has
    MEMBERS ||--o{ ATTENDANCE_SESSIONS : visits
    GYM_BRANCHES ||--o{ ATTENDANCE_SESSIONS : records
    ATTENDANCE_SESSIONS ||--o{ ATTENDANCE_EVENTS : tracks
    MEMBERS ||--o{ QR_CREDENTIALS : owns
    GYMS ||--|| GYM_BRANDING : configures
```

### Database engineering rules

1.  Use UUIDs for primary identifiers.
2.  Associate every gym-owned record with the correct tenant.
3.  Use foreign keys and database constraints to protect relationships.
4.  Store passwords using a strong password-hashing algorithm; never
    store plaintext passwords.
5.  Store timestamps in UTC and display them using the gym's configured
    timezone.
6.  Preserve financial and attendance history; use controlled
    corrections and audit logs.
7.  Use database transactions for operations such as check-in and
    payment recording.
8.  Add indexes for frequent lookups, such as gym, branch, member, and
    attendance timestamps.
9.  Test tenant isolation at both API and database levels.

## 8. User journeys

### Journey A --- Gym owner

1.  Visits GymPulse and registers an account.
2.  Submits gym details and contact information.
3.  The application enters a pending state if approval is required.
4.  GymPulse Super Admin reviews the application.
5.  After approval, the owner accesses the gym dashboard.
6.  Configures gym branding and branches.
7.  Creates membership plans.
8.  Invites trainers and staff.
9.  Registers members.
10. Monitors attendance, occupancy, memberships, and analytics.

The owner dashboard should answer:

-   How many members are registered?
-   How many memberships are currently active?
-   How many people are inside now?
-   Who checked in today?
-   Which memberships are expiring?
-   What are the busiest hours?
-   Which members have become less active?

### Journey B --- Gym member

1.  Gym staff registers the member or sends an invitation.
2.  The member activates their account.
3.  Opens the mobile-friendly member portal.
4.  Views membership status and personal QR pass.
5.  Scans the gym's check-in scanner.
6.  The server validates the QR token and membership.
7.  Attendance is recorded.
8.  The member sees a successful check-in confirmation.
9.  The member can review attendance history and consistency.
10. The member can check the gym's current crowd level.

### Journey C --- Trainer

1.  The owner invites the trainer.
2.  The trainer activates their account.
3.  The owner assigns members to the trainer.
4.  The trainer opens their workspace.
5.  Views assigned members and permitted attendance information.
6.  Checks attendance consistency.
7.  Adds appropriate progress or follow-up notes.
8.  Follows up with members who may need support.

### Journey D --- GymPulse Super Admin

1.  Reviews new gym applications.
2.  Approves, rejects, or requests additional information.
3.  Manages gym accounts and platform subscriptions.
4.  Handles support requests and reported issues.
5.  Monitors platform-level usage and operational health.

Super Admin access to sensitive member information should be limited,
justified, and audited.

## 9. Critical workflows

### A. QR attendance workflow

``` mermaid
flowchart TD
    A["Member opens QR pass"] --> B["Generate short-lived signed token"]
    B --> C["Gym scanner scans QR"]
    C --> D["Backend validates token"]
    D --> E{"Token and context valid?"}
    E -->|No| F["Reject request"]
    E -->|Yes| G{"Membership active?"}
    G -->|No| H["Show membership issue"]
    G -->|Yes| I{"Already inside?"}
    I -->|Yes| J["Prevent duplicate entry"]
    I -->|No| K["Create attendance session"]
    K --> L["Update occupancy"]
    L --> M["Send authorized live update"]
```

Use a dynamic QR token rather than a permanent QR image. The token
should be short-lived, cryptographically signed, scoped to the correct
gym or branch, and protected against replay.

The scanner can initially be a staff-facing page on a phone, tablet, or
reception computer. Dedicated scanning hardware is not required for the
MVP.

### B. Live occupancy workflow

**Member enters:**

-   Validate the member and membership.
-   Create an attendance session.
-   Increase the branch's occupancy count.
-   Publish an authorized update to connected dashboards.

**Member exits:**

-   Validate the active session.
-   Record the exit.
-   Close the attendance session.
-   Decrease occupancy.
-   Publish an updated count.

Forgotten check-outs must be handled carefully. The system should flag
unusually long open sessions for staff review instead of silently
assuming that the member has left.

### C. Inactivity detection

Start with explainable rules:

1.  Compare recent visits with the member's previous attendance pattern.
2.  Detect a meaningful drop in attendance.
3.  Create a follow-up suggestion for the assigned trainer.
4.  Record whether the trainer followed up.

This identifies attendance changes; it does not prove why a member
stopped visiting or predict their intentions. Advanced models can be
considered after collecting enough reliable data.

## 10. Backend API plan

Use REST APIs for most operations and Socket.IO for live updates.

  Module             Example endpoint                   Action
  ------------------ ---------------------------------- ----------------------
  Authentication     `POST /api/auth/login`             Login
  Gym registration   `POST /api/gyms/register`          Register gym
  Applications       `GET /api/admin/applications`      Review applications
  Members            `GET /api/members`                 List members
  Members            `POST /api/members`                Add member
  Memberships        `POST /api/subscriptions`          Create membership
  Attendance         `POST /api/attendance/check-in`    Record entry
  Attendance         `POST /api/attendance/check-out`   Record exit
  Attendance         `GET /api/attendance/history`      View history
  Analytics          `GET /api/analytics/overview`      Dashboard statistics
  Trainers           `GET /api/trainers/assignments`    View assignments
  Branding           `PATCH /api/gyms/branding`         Update gym branding

All protected endpoints must enforce authentication, role permissions,
and gym-level access. Request validation and consistent error responses
are required.

## 11. Security and reliability

Security is a core product requirement because GymPulse stores personal
information, membership records, and payment records.

Baseline requirements:

-   HTTPS for all production communication.
-   Strong password hashing.
-   Secure, HTTP-only session cookies.
-   Role-based access control.
-   Gym-level tenant isolation.
-   Rate limiting on login and QR verification.
-   Short-lived QR tokens and replay protection.
-   Database backups and restore testing.
-   Audit logs for important actions.
-   Input validation and protection against common web attacks.
-   Account recovery and session revocation.
-   Least-privilege access to personal and financial information.
-   Data retention and deletion policies appropriate to applicable law.

Collect only the personal information needed to operate the gym. Do not
collect biometric data in the MVP.

## 12. Deployment architecture

``` mermaid
flowchart TB
    USERS["Members, Trainers, Owners, Admins"]
    USERS --> DOMAIN["GymPulse domain and gym subdomains"]
    DOMAIN --> FRONTEND["Frontend hosting - React"]
    FRONTEND --> BACKEND["Backend hosting - Node.js API"]
    BACKEND --> DB[("Managed PostgreSQL")]
    BACKEND --> STORAGE["Object storage"]
    BACKEND --> SOCKET["Real-time connection"]
    BACKEND --> OBS["Logs, monitoring, alerts"]
```

Evaluate providers such as Vercel or equivalent frontend hosting, Render
or equivalent backend hosting, and managed PostgreSQL providers such as
Neon or Supabase.

Choose the final provider based on pricing, deployment compatibility,
backups, connection limits, regional availability, and operational
requirements. These are candidates to evaluate, not a final provider
commitment.

## 13. MVP scope

The MVP must be usable by one real gym, not merely a collection of
attractive screens.

### Included in MVP

-   Owner registration and gym application approval.
-   Multi-gym data-isolation foundation.
-   Basic white-label branding.
-   Owner dashboard.
-   Member registration and management.
-   Membership plans and expiry tracking.
-   QR-based check-in and check-out.
-   Duplicate check-in prevention.
-   Staff-assisted attendance.
-   Attendance history.
-   Live occupancy.
-   Basic trainer workspace and member assignments.
-   Member portal and personal QR pass.
-   Basic attendance and peak-hour reports.
-   Basic inactivity alerts.

### MVP completion criteria

The MVP is ready for a real-gym pilot when:

1.  An owner can register a gym and complete the approval process.
2.  The owner can configure the gym and create membership plans.
3.  The owner can register a member.
4.  The member can receive and access a unique QR pass.
5.  The scanner can verify the pass and membership.
6.  Check-in and check-out records are saved correctly.
7.  Duplicate and unauthorized entries are rejected.
8.  Occupancy updates correctly.
9.  Trainers can access only their assigned members.
10. Members can see their own attendance and membership information.
11. Automated tests confirm that gyms cannot access each other's data.

## 14. Full product feature roadmap

  -----------------------------------------------------------------------
  Module                              Final capabilities
  ----------------------------------- -----------------------------------
  Smart presence                      QR, NFC, optional biometric
                                      integrations, anti-fraud checks

  Live intelligence                   Real-time occupancy, crowd
                                      predictions, equipment availability

  Membership                          Plans, renewals, automated billing,
                                      discounts, invoices

  Member engagement                   Streaks, goals, reminders,
                                      personalized engagement

  Trainer tools                       Workout plans, progress tracking,
                                      client management

  Owner analytics                     Revenue, retention, attendance,
                                      peak-hour reports

  Automation                          Renewal reminders, inactivity
                                      alerts, scheduled reports

  Multi-gym SaaS                      Multiple gyms, branches,
                                      centralized management,
                                      subscriptions

  Integrations                        Payment gateways, messaging,
                                      access-control hardware

  Security                            Role-based access, audit logs, data
                                      protection, backups
  -----------------------------------------------------------------------

### Main differentiator: Member Retention Intelligence

GymPulse should eventually help gyms understand and improve member
consistency.

Example:

> A member's visits have dropped significantly compared with their usual
> pattern. GymPulse flags the change and suggests that the assigned
> trainer check in with the member.

This is a support tool, not an automated judgment about a person's
motivation or intentions.

## 15. Business model

GymPulse will use a recurring subscription model. The following prices
are initial hypotheses for market testing in India, not validated market
rates.

  Proposed plan     Monthly price Intended customer
  --------------- --------------- -------------------
  Starter                    ₹499 Small gyms
  Growth                     ₹999 Growing gyms
  Pro                      ₹1,999 Larger gyms

Potential plan differences:

-   **Starter:** attendance and membership management.
-   **Growth:** trainer tools, analytics, and engagement.
-   **Pro:** advanced analytics, multiple branches, and integrations.

Validate willingness to pay with real gym owners before finalizing
pricing.

## 16. Development roadmap

  -----------------------------------------------------------------------
  Phase                               Deliverable
  ----------------------------------- -----------------------------------
  1\. Product foundation              Project structure, database design,
                                      UI plan, authentication design

  2\. Authentication                  Registration, login, roles, gym
                                      approval, tenant isolation

  3\. Owner workspace                 Dashboard, branding, branches,
                                      staff

  4\. Members and memberships         Profiles, plans, subscriptions,
                                      expiry, payment records

  5\. Presence engine                 QR, scanning, validation, check-in,
                                      check-out, occupancy

  6\. Member and trainer portals      Separate interfaces and permissions

  7\. Analytics and notifications     Reports, inactivity rules,
                                      reminders

  8\. Testing and deployment          Security tests, tenant-isolation
                                      tests, real-gym pilot

  9\. Product expansion               SaaS billing, integrations,
                                      advanced intelligence
  -----------------------------------------------------------------------

## 17. What is deliberately out of scope for the first release?

To keep the first release achievable and reliable:

-   AI workout generation.
-   Biometric recognition.
-   Physical turnstile or door-control hardware.
-   Complex online payment gateway integration.
-   Dedicated Android or iOS applications.
-   Advanced predictive AI before reliable data exists.
-   Full equipment availability tracking without a dependable data
    source.

The first release should prove that attendance, membership management,
and occupancy work reliably.

## 18. Pre-development checklist

Before writing application code, complete these design tasks:

-   [ ] Finalize the owner, trainer, member, and Super Admin journeys.
-   [ ] Design desktop and mobile screen layouts.
-   [ ] Define navigation and screen-level permissions.
-   [ ] Finalize the database schema, constraints, and indexes.
-   [ ] Define API request and response contracts.
-   [ ] Specify gym registration and approval states.
-   [ ] Specify QR token generation, expiry, and replay protection.
-   [ ] Define check-in, check-out, and forgotten-exit handling.
-   [ ] Define tenant-isolation tests.
-   [ ] Select hosting and database providers.
-   [ ] Define backup, monitoring, and recovery procedures.

------------------------------------------------------------------------

## Final product definition

**GymPulse --- Smart Gym Presence & Intelligence Platform**

**Vision:** Make gym operations smarter, member experiences simpler, and
fitness consistency easier to maintain.

**Target customers:** Independent gyms, fitness studios, and eventually
multi-branch gym businesses.

**Core MVP:** Member management, membership management, QR attendance,
live occupancy, trainer workspace, and member portal.

**Long-term differentiator:** Member Retention Intelligence and Live Gym
Intelligence.

**Business model:** Multi-tenant SaaS with recurring subscriptions.

**Development approach:** Web-first, mobile-responsive, secure modular
monolith, PostgreSQL database, and cloud deployment.

**Next design deliverable:** A complete UI blueprint for the four
interfaces---Super Admin, Gym Owner, Trainer, and Member---with every
screen, navigation path, and button behavior defined before frontend
development begins.

------------------------------------------------------------------------

*End of GymPulse Product Blueprint · Version 1.0*
