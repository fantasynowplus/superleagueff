const MFL_YEAR = '2026';

async function generateGraphic() {
    const username = document.getElementById('username').value.trim();
    const loader = document.getElementById('loader');

    if (!username) return alert("Enter your Sleeper username");

    loader.style.display = 'block';
    loader.innerText = "Syncing draft data...";

    try {
        await handleSleeper(username);
    } catch (e) {
        console.error("Detailed Error:", e);
        alert("Error fetching data: " + e.message);
    } finally {
        loader.style.display = 'none';
    }
}

async function handleSleeper(username) {
    const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
    if (!userRes.ok) throw new Error('User not found');
    const user = await userRes.json();

    const leaguesRes = await fetch(`https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/${MFL_YEAR}`);
    if (!leaguesRes.ok) throw new Error('Could not fetch leagues');
    const leagues = await leaguesRes.json();

    const slffLeague = leagues.find(l => l.name && l.name.startsWith("#SLFF4"));
    if (!slffLeague) return alert("No #SLFF4 league found for this user.");

    const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${slffLeague.league_id}`);
    if (!leagueRes.ok) throw new Error('Could not fetch league');
    const leagueData = await leagueRes.json();

    if (!leagueData.draft_id) return alert("No draft found for this league");

    const picksRes = await fetch(`https://api.sleeper.app/v1/draft/${leagueData.draft_id}/picks`);
    if (!picksRes.ok) throw new Error('Could not fetch picks');
    const allPicks = await picksRes.json();

    const myPicks = allPicks
        .filter(p => p.picked_by === user.user_id)
        .sort((a, b) => a.pick_no - b.pick_no);

    if (myPicks.length === 0) return alert("No picks found for this user");

    draw(myPicks, user.display_name, slffLeague.name, allPicks);
}

function draw(picks, managerName, leagueName, allPicks) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const imgTag = document.getElementById('finalImage');

    canvas.width = 1000;
    canvas.height = 550;

    const slffLogo = new Image();

    let imagesLoaded = 0;
    function imageLoadedCallback() {
        imagesLoaded++;
        if (imagesLoaded === 1) {
            renderBoard(ctx, picks, managerName, leagueName, slffLogo, canvas.height, allPicks);
            imgTag.src = canvas.toDataURL("image/png");
            imgTag.style.display = 'block';
            document.getElementById('downloadBtn').style.display = 'block';
        }
    }

    slffLogo.src = "assets/images/Super-League-Banner.png";
    slffLogo.onload = imageLoadedCallback;
    slffLogo.onerror = () => { slffLogo.failed = true; imageLoadedCallback(); };
}

function getSnakeDraftPosition(pickNo) {
    const LEAGUE_SIZE = 12;
    const team = (pickNo - 1) % LEAGUE_SIZE + 1;
    const round = Math.floor((pickNo - 1) / LEAGUE_SIZE) + 1;
    
    let slot;
    if (round % 2 === 1) {
        slot = team;
    } else {
        slot = LEAGUE_SIZE + 1 - team;
    }
    
    return `${round}.${String(slot).padStart(2, '0')}`;
}

function getPositionDraftNumber(allPicks, playerPickNo) {
    const targetPick = allPicks.find(p => p.pick_no === playerPickNo);
    if (!targetPick || !targetPick.metadata) return 1;
    
    const position = targetPick.metadata.position;
    let count = 0;
    
    for (let pick of allPicks) {
        if (pick.pick_no < playerPickNo && pick.metadata && pick.metadata.position === position) {
            count++;
        }
    }
    
    return count + 1;
}

function renderBoard(ctx, picks, manager, league, slffLogo, canvasHeight, allPicks) {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 120);
    ctx.lineTo(1000, 120);
    ctx.stroke();

    const targetHeight = 70;
    const targetY = 15;
    let currentX = 25;

    if (slffLogo && !slffLogo.failed) {
        const scale = targetHeight / slffLogo.height;
        const logoWidth = slffLogo.width * scale;
        ctx.drawImage(slffLogo, currentX, targetY, logoWidth, targetHeight);
        currentX += logoWidth + 15;
    }

    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px sans-serif";
    ctx.fillText(manager, 975, 65);
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(league, 975, 90);

    if (picks && Array.isArray(picks)) {
        const rowHeight = 48;
        const picksPerColumn = 7;
        ctx.textAlign = "left";

        picks.slice(0, 14).forEach((p, i) => {
            if (!p) return;

            const isRightCol = i >= picksPerColumn;
            const colX = isRightCol ? 500 : 0;
            const rowInColumn = i % picksPerColumn;
            const y = 135 + (rowInColumn * rowHeight);

            const posRaw = (p.metadata?.position || "UNK").toUpperCase();
            const posDraftNum = getPositionDraftNumber(allPicks, p.pick_no);
            const snakeDraftPos = getSnakeDraftPosition(p.pick_no);

            let color = "#475569";
            if (posRaw.includes("QB")) color = "#f43f5e";
            else if (posRaw.includes("RB")) color = "#00ceb8";
            else if (posRaw.includes("WR")) color = "#93c5fd";
            else if (posRaw.includes("TE")) color = "#ffb26b";
            else if (posRaw.includes("K") || posRaw.includes("DEF")) color = "#c084fc";

            ctx.fillStyle = color;
            ctx.fillRect(colX, y, 500, rowHeight);

            ctx.fillStyle = "#0f172a";
            ctx.font = "12px sans-serif";
            ctx.fillText(snakeDraftPos, colX + 15, y + 30);
            ctx.font = "bold 16px sans-serif";
            ctx.fillText(posRaw + posDraftNum, colX + 65, y + 30);
            ctx.font = "bold 22px sans-serif";
            const playerName = `${p.metadata?.first_name || "Unknown"} ${p.metadata?.last_name || ""}`.trim();
            ctx.fillText(playerName, colX + 135, y + 30);
        });
    }

    drawFooter(ctx, canvasHeight);
}

function drawFooter(ctx, canvasHeight) {
    const footerHeightPx = 50;
    const footerStartY = canvasHeight - footerHeightPx;
    const footerTextY = footerStartY + 32;

    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, footerStartY, 1000, footerHeightPx);

    const mainText = "SFB16 Roster powered by ";
    const brandText = "FantasyNow";
    const plusText = "+";

    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "left";

    const widthMain = ctx.measureText(mainText).width;
    const widthBrand = ctx.measureText(brandText).width;
    const widthPlus = ctx.measureText(plusText).width;
    const totalWidth = widthMain + widthBrand + widthPlus;

    let currentX = (1000 - totalWidth) / 2;

    ctx.fillStyle = "#94a3b8";
    ctx.fillText(mainText, currentX, footerTextY);
    currentX += widthMain;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(brandText, currentX, footerTextY);
    currentX += widthBrand;

    ctx.fillStyle = "#FFA515";
    ctx.fillText(plusText, currentX, footerTextY);
}

function downloadImg() {
    const link = document.createElement('a');
    link.download = 'DraftRecap.png';
    link.href = document.getElementById('finalImage').src;
    link.click();
}
