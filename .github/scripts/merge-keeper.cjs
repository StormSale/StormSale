/**
 * StormSale Merge Keeper Bot
 *
 * Enforces:
 * 1. Target branch must be 'dev'.
 * 2. No merge conflicts with target branch.
 * 3. All required CI checks (Frontend CI & Test Audit, Secret Scan, PR Compliance) must pass.
 * 4. CodeRabbit review must be completed with all actionable suggestions addressed.
 * 5. Drops an informative audit status / review comment on unmerged PRs with concrete action items.
 * 6. Merges the PR when all conditions are satisfied.
 */

const KEEPER_MARKER = '<!-- stormsale-merge-keeper -->';

async function evaluatePR({ github, owner, repo, prNumber, dryRun = false }) {
  // 1. Fetch full PR details
  const { data: pr } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  if (pr.state !== 'open') {
    return { skipped: true, reason: `PR #${prNumber} is already ${pr.state}.` };
  }

  const headSha = pr.head.sha;
  const isTargetDev = pr.base.ref === 'dev';

  // If GitHub has not computed mergeability yet (mergeable is null), wait briefly and re-fetch
  if (pr.mergeable === null) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const refetched = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });
      pr = refetched.data;
    } catch {
      // Ignore retry failure and proceed with initial pr object
    }
  }

  // 2. Check mergeability & conflicts strictly
  let hasConflicts = false;
  let mergeableClean = false;
  let conflictDetails = '';

  if (pr.mergeable === false || pr.mergeable_state === 'dirty') {
    hasConflicts = true;
    mergeableClean = false;
    conflictDetails = 'Merge conflicts detected with `dev`. Branch needs conflict resolution.';
  } else if (pr.mergeable === true) {
    hasConflicts = false;
    mergeableClean = true;
    conflictDetails = 'No merge conflicts.';
  } else {
    // Null: GitHub background calculation is still pending. Do not falsely claim conflicts.
    hasConflicts = false;
    mergeableClean = false;
    conflictDetails = 'Mergeability is being computed by GitHub. Will re-verify on next check.';
  }

  // 3. Evaluate CI Checks
  const { data: checkRunsData } = await github.rest.checks.listForRef({
    owner,
    repo,
    ref: headSha,
    per_page: 100,
  });

  const checkRuns = checkRunsData.check_runs.filter(
    (cr) => !cr.name.toLowerCase().includes('merge keeper')
  );

  // Group check runs by workflow/job
  const requiredCheckNames = [
    { key: 'ci', patterns: ['frontend ci', 'build-and-test'], label: 'Frontend CI & Test Audit' },
    { key: 'secret', patterns: ['secret & key leak', 'secret-scan'], label: 'Secret & Key Leak Scan' },
    { key: 'compliance', patterns: ['pr compliance', 'validate-pr'], label: 'PR Compliance' },
  ];

  let ciPassed = true;
  let ciRunning = false;
  const ciDetails = [];
  const failingChecks = [];

  for (const req of requiredCheckNames) {
    const found = checkRuns.find((cr) =>
      req.patterns.some((p) => cr.name.toLowerCase().includes(p))
    );

    if (!found) {
      ciPassed = false;
      ciRunning = true;
      ciDetails.push(`- **${req.label}**: ⏳ Pending trigger`);
    } else if (found.status !== 'completed') {
      ciPassed = false;
      ciRunning = true;
      ciDetails.push(`- **${req.label}**: ⏳ Running (${found.status})`);
    } else if (found.conclusion === 'success') {
      ciDetails.push(`- **${req.label}**: ✅ Passed`);
    } else {
      ciPassed = false;
      failingChecks.push(req.label);
      ciDetails.push(`- **${req.label}**: ❌ Failed (${found.conclusion})`);
    }
  }

  // Also check combined commit statuses (ignoring Vercel fork authorization)
  const { data: combinedStatus } = await github.rest.repos.getCombinedStatusForRef({
    owner,
    repo,
    ref: headSha,
  });

  for (const status of combinedStatus.statuses) {
    if (status.context.toLowerCase().includes('vercel')) {
      // Ignore Vercel fork authorization requirement
      continue;
    }
    if (status.context.toLowerCase().includes('coderabbit')) {
      // Evaluated separately in CodeRabbit section
      continue;
    }
    if (status.state === 'failure') {
      ciPassed = false;
      failingChecks.push(status.context);
      ciDetails.push(`- **${status.context}**: ❌ Failed`);
    } else if (status.state === 'pending') {
      ciPassed = false;
      ciRunning = true;
      ciDetails.push(`- **${status.context}**: ⏳ Pending`);
    }
  }

  // 4. Evaluate CodeRabbit Review
  const { data: reviews } = await github.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const codeRabbitReviews = reviews.filter(
    (r) =>
      r.user &&
      (r.user.login.toLowerCase().includes('coderabbit') ||
        r.user.login.toLowerCase().includes('coderabbitai'))
  );

  let codeRabbitClean = false;
  let codeRabbitStatus = '';
  let codeRabbitDetails = '';
  let actionableCommentsCount = 0;

  if (codeRabbitReviews.length === 0) {
    codeRabbitClean = false;
    codeRabbitStatus = 'Awaiting Review';
    codeRabbitDetails = '⏳ CodeRabbit AI review is pending. Awaiting initial analysis.';
  } else {
    // Get latest review from CodeRabbit
    const latestCRReview = codeRabbitReviews[codeRabbitReviews.length - 1];

    // Check actionable comments in latest review body
    const match = latestCRReview.body ? latestCRReview.body.match(/Actionable comments posted:\s*(\d+)/i) : null;
    if (match) {
      actionableCommentsCount = parseInt(match[1], 10);
    }

    if (latestCRReview.state === 'CHANGES_REQUESTED') {
      codeRabbitClean = false;
      codeRabbitStatus = 'Changes Requested';
      codeRabbitDetails = `⚠️ CodeRabbit requested changes with ${actionableCommentsCount} actionable suggestion(s). All inline suggestions must be addressed.`;
    } else if (latestCRReview.state === 'APPROVED') {
      codeRabbitClean = true;
      codeRabbitStatus = 'Approved';
      codeRabbitDetails = '✅ CodeRabbit approved this pull request.';
    } else if (actionableCommentsCount > 0) {
      // Check if unaddressed inline review comments remain
      const { data: reviewComments } = await github.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });

      const crComments = reviewComments.filter(
        (c) =>
          c.user &&
          c.user.login.toLowerCase().includes('coderabbit') &&
          !c.body.includes('✅ Addressed in commit')
      );

      if (crComments.length > 0) {
        codeRabbitClean = false;
        codeRabbitStatus = 'Suggestions Pending';
        codeRabbitDetails = `⚠️ ${crComments.length} unaddressed CodeRabbit suggestion(s) remain. Please review and apply the fixes.`;
      } else {
        codeRabbitClean = true;
        codeRabbitStatus = 'Suggestions Addressed';
        codeRabbitDetails = '✅ All CodeRabbit suggestions have been addressed.';
      }
    } else {
      codeRabbitClean = true;
      codeRabbitStatus = 'Clean';
      codeRabbitDetails = '✅ CodeRabbit review completed with 0 actionable issues.';
    }
  }

  // 5. Compile Action Items
  const actionItems = [];
  if (!isTargetDev) {
    actionItems.push(`**Change base branch to \`dev\`**: This PR currently targets \`${pr.base.ref}\`. All pull requests must target the \`dev\` branch.`);
  }
  if (hasConflicts) {
    actionItems.push(`**Resolve merge conflicts with \`dev\`**: This branch has conflicting files with \`dev\`. Run \`git fetch origin dev && git rebase origin/dev\`, resolve the conflict markers, and push.`);
  }
  if (failingChecks.length > 0) {
    actionItems.push(`**Fix failing CI check(s)**: Address errors in ${failingChecks.map(c => `\`${c}\``).join(', ')}.`);
  } else if (ciRunning) {
    actionItems.push(`**Wait for CI checks to complete**: Automated tests and audits are currently executing.`);
  }
  if (!codeRabbitClean) {
    if (codeRabbitStatus === 'Awaiting Review') {
      actionItems.push(`**Wait for CodeRabbit AI review**: The review is currently queued or in progress.`);
    } else {
      actionItems.push(`**Apply CodeRabbit suggested fixes**: Inspect inline review comments from CodeRabbit, apply the changes, and push updates.`);
    }
  }
  if (pr.draft) {
    actionItems.push(`**Mark PR ready for review**: Remove draft status once implementation is complete.`);
  }

  const canMerge = isTargetDev && mergeableClean && ciPassed && codeRabbitClean && !pr.draft;

  // 6. Execute Merge or Drop Status Review
  if (canMerge) {
    if (!dryRun) {
      // Merge PR using squash
      await github.rest.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: 'squash',
        commit_title: `${pr.title} (#${prNumber})`,
        commit_message: `Automated merge by StormSale Merge Keeper after all CI checks, test audits, and CodeRabbit review verifications passed.`,
      });

      const celebrationComment = `${KEEPER_MARKER}
## 🚀 PR Merged by StormSale Merge Keeper!

All automated merge criteria have been met:
- ✅ Target branch is \`dev\`
- ✅ Clean rebase with no merge conflicts
- ✅ Frontend CI & Vitest test audit passed
- ✅ Secret & Key leak scan passed (no leaked credentials)
- ✅ CodeRabbit review completed with all suggestions addressed

Thank you for your contribution to **StormSale**! 🎉`;

      await postOrUpdateComment({ github, owner, repo, prNumber, body: celebrationComment });
    }
    return { prNumber, merged: true, dryRun };
  } else {
    // Drop status comment
    const statusBody = `${KEEPER_MARKER}
## 🛡️ StormSale Merge Keeper Audit

**Merge Status:** 🚫 **Not Ready to Merge**

| Gate | Status | Details |
| :--- | :---: | :--- |
| **Target Branch (\`dev\`)** | ${isTargetDev ? '✅ Passed' : '❌ Failed'} | ${isTargetDev ? 'Targets `dev`' : `Targets \`${pr.base.ref}\` (must target \`dev\`)`} |
| **Merge Conflicts** | ${hasConflicts ? '❌ Conflicts' : (mergeableClean ? '✅ Clean' : '⏳ Checking')} | ${conflictDetails} |
| **CI & Test Audit** | ${ciPassed ? '✅ Passed' : (ciRunning ? '⏳ Running' : '❌ Failed')} | ${ciPassed ? 'All required checks passing' : (failingChecks.length ? `Failing: ${failingChecks.join(', ')}` : 'In progress')} |
| **CodeRabbit Review** | ${codeRabbitClean ? '✅ Clean' : (codeRabbitStatus === 'Awaiting Review' ? '⏳ Awaiting' : '⚠️ Action Needed')} | ${codeRabbitDetails} |

<details>
<summary>🔍 <b>Detailed Check Breakdown</b></summary>

${ciDetails.join('\n')}

</details>

### 📋 Action Items for Contributor:
${actionItems.map((item) => `- [ ] ${item}`).join('\n')}

---
*The Merge Keeper monitors this PR and will automatically re-evaluate upon new commits, CI completions, or CodeRabbit reviews.*`;

    await postOrUpdateComment({ github, owner, repo, prNumber, body: statusBody });
    return { prNumber, merged: false, actionItems };
  }
}

async function postOrUpdateComment({ github, owner, repo, prNumber, body }) {
  const { data: comments } = await github.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existingComment = comments.find((c) => c.body && c.body.includes(KEEPER_MARKER));

  if (existingComment) {
    if (existingComment.body.trim() !== body.trim()) {
      await github.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body,
      });
    }
  } else {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }
}

async function run({ github, context, core, specificPrNumber = null, dryRun = false }) {
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  let prNumbers = [];

  if (specificPrNumber) {
    prNumbers = [parseInt(specificPrNumber, 10)];
  } else if (context.payload.pull_request) {
    prNumbers = [context.payload.pull_request.number];
  } else {
    // Sweep all open PRs across all pages
    const openPRs = await github.paginate(github.rest.pulls.list, {
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });
    // Sort ascending by number so earlier PRs are processed in sequence
    prNumbers = openPRs.map((pr) => pr.number).sort((a, b) => a - b);
  }

  core.info(`Merge Keeper evaluating ${prNumbers.length} PR(s): ${prNumbers.join(', ')}`);

  const results = [];
  for (const num of prNumbers) {
    try {
      core.info(`Evaluating PR #${num}...`);
      const res = await evaluatePR({ github, owner, repo, prNumber: num, dryRun });
      results.push(res);
      // Pacing delay to avoid burst secondary rate limits across 70+ PRs
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      core.error(`Error processing PR #${num}: ${err.message}`);
    }
  }

  return results;
}

module.exports = { evaluatePR, run };
