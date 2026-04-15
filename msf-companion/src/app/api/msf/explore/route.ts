import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { NextResponse } from "next/server";

// Temporary test endpoint — explore MSF API endpoints for feature research
// DELETE THIS after research is complete
export async function GET(request: Request) {
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized — please log in first" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint") || "events";

  const results: Record<string, unknown> = {};

  try {
    switch (endpoint) {
      case "events": {
        // Current/upcoming events
        const ev = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
          path: "/game/v1/events?eventInfo=full&perPage=100",
          accessToken: token,
        });
        results.events = ev.data?.map((e: any) => ({
          id: e.id, type: e.type, name: e.name,
          startTime: e.startTime, endTime: e.endTime,
          episodic: e.episodic, milestone: e.milestone,
        }));
        results.meta = ev.meta;
        break;
      }
      case "player-events": {
        // Player's event progress
        const pe = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
          path: "/player/v1/events?eventInfo=full&objRewards=full&perPage=100",
          accessToken: token,
        });
        results.playerEvents = pe.data?.map((e: any) => ({
          id: e.id, type: e.type, name: e.name,
          startTime: e.startTime, endTime: e.endTime,
          milestone: e.milestone,
          episodic: e.episodic,
        }));
        results.meta = pe.meta;
        break;
      }
      case "team-order": {
        // Official team compositions by tab
        const tabs = ["roster", "blitz", "tower", "raids", "arena", "war", "crucible"];
        for (const tab of tabs) {
          const to = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
            path: `/game/v1/analysis/teamOrder/${tab}?perPage=200`,
            accessToken: token,
          });
          results[tab] = {
            total: (to.meta as any)?.total,
            teams: (to.data || []).slice(0, 5).map((t: any) => ({
              squad: t.squad, total: t.total,
            })),
          };
        }
        break;
      }
      case "upgrade-data": {
        // Upgrade costs for everything
        const ud = await msfApiFetch<{ data?: unknown }>({
          path: "/game/v1/upgradeData?pieceInfo=full&pieceFlatCost=full&pieceDirectCost=full",
          accessToken: token,
        });
        const data = ud.data as Record<string, unknown>;
        results.fields = Object.keys(data || {});
        // Just show structure, not full data (it's huge)
        for (const key of Object.keys(data || {})) {
          const val = data[key];
          if (Array.isArray(val)) {
            results[key] = `Array[${val.length}]`;
          } else if (typeof val === "object" && val !== null) {
            results[key] = Object.keys(val).slice(0, 10);
          }
        }
        break;
      }
      case "inventory": {
        // Player inventory by type
        const types = ["GEAR", "ABILITY_MATERIAL", "SHARD", "CONSUMABLE"];
        for (const t of types) {
          const inv = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
            path: `/player/v1/inventory?itemType=${t}&itemFormat=id&perPage=10`,
            accessToken: token,
          });
          results[t] = {
            total: (inv.meta as any)?.total,
            sample: (inv.data || []).slice(0, 5),
          };
        }
        break;
      }
      case "squads": {
        // Player's saved squad compositions
        const sq = await msfApiFetch<{ data?: unknown }>({
          path: "/player/v1/squads",
          accessToken: token,
        });
        results.squads = sq.data;
        break;
      }
      case "raids": {
        // All available raids with requirements
        const raids = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
          path: "/game/v1/raids?raidInfo=full&perPage=50",
          accessToken: token,
        });
        results.raids = (raids.data || []).map((r: any) => ({
          id: r.id, groupId: r.groupId, name: r.name,
          teams: r.teams, maxPlayersPerTeam: r.maxPlayersPerTeam,
        }));
        results.meta = raids.meta;
        break;
      }
      case "episodics": {
        // Event campaigns
        const types = ["eventCampaign", "flashEvent", "unlockEvent"];
        for (const t of types) {
          try {
            const ep = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
              path: `/game/v1/episodics/${t}?perPage=20`,
              accessToken: token,
            });
            results[t] = {
              total: (ep.meta as any)?.total,
              items: (ep.data || []).slice(0, 5).map((e: any) => ({
                id: e.id, name: e.name, requirements: e.requirements,
              })),
            };
          } catch { results[t] = "error"; }
        }
        break;
      }
      case "towers": {
        // Survival towers with requirements
        const st = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
          path: "/game/v1/survivalTowers?raidInfo=full&perPage=20",
          accessToken: token,
        });
        results.towers = (st.data || []).map((t: any) => ({
          id: t.id, name: t.name, teams: t.teams,
        }));
        results.meta = st.meta;
        break;
      }
      case "dds": {
        const dd = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
          path: "/game/v1/dds?raidInfo=full&nodeReqs=full&perPage=20",
          accessToken: token,
        });
        results.dds = (dd.data || []).map((d: any) => ({
          id: d.id, name: d.name, teams: d.teams,
          rooms: d.rooms?.slice(0, 2),
        }));
        results.meta = dd.meta;
        break;
      }
      case "dd-detail": {
        // Get a specific DD with full node requirements
        const ddId = searchParams.get("id") || "dd5";
        const dd = await msfApiFetch<{ data?: unknown }>({
          path: `/game/v1/dds/${ddId}?raidInfo=full&nodeReqs=full&pieceInfo=full`,
          accessToken: token,
        });
        results.dd = dd.data;
        break;
      }
      case "raid-detail": {
        // Get a specific raid with full node requirements
        const raidId = searchParams.get("id") || "u9";
        const raid = await msfApiFetch<{ data?: unknown }>({
          path: `/game/v1/raids/${raidId}?raidInfo=full&nodeReqs=full&pieceInfo=full`,
          accessToken: token,
        });
        results.raid = raid.data;
        break;
      }
      case "char-instances": {
        // Character instance power calculations
        const charId = searchParams.get("id") || "AIM_Infector";
        const inst = await msfApiFetch<{ data?: unknown }>({
          path: `/game/v1/characterInstances/${charId}`,
          accessToken: token,
        });
        results.instances = inst.data;
        break;
      }
      case "alliance": {
        // Alliance info
        const card = await msfApiFetch<{ data?: unknown }>({
          path: "/player/v1/alliance/card",
          accessToken: token,
        });
        results.alliance = card.data;
        const members = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
          path: "/player/v1/alliance/members?perPage=24",
          accessToken: token,
        });
        results.members = (members.data || []).map((m: any) => ({
          name: m.name, tcp: m.tcp, level: m.level, icon: m.icon,
        }));
        results.membersMeta = members.meta;
        break;
      }
      case "dd-room": {
        // Get a specific DD room with node-level requirements
        const ddRoomDdId = searchParams.get("id") || "dd_id_insanity_event_card_info_08";
        const roomId = searchParams.get("room") || "A1";
        const room = await msfApiFetch<{ data?: unknown }>({
          path: `/game/v1/dds/${ddRoomDdId}/${roomId}?nodeReqs=full&pieceInfo=full&traitFormat=id`,
          accessToken: token,
        });
        results.room = room.data;
        break;
      }
      case "wishlist": {
        const wl = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
          path: "/player/v1/itemWishlist?itemFormat=id&perPage=50",
          accessToken: token,
        });
        results.wishlist = wl.data;
        results.meta = wl.meta;
        break;
      }
      case "orbs": {
        const orbs = await msfApiFetch<{ data?: unknown[]; meta?: unknown }>({
          path: "/game/v1/orbRewards?perPage=20",
          accessToken: token,
        });
        results.orbs = (orbs.data || []).slice(0, 5).map((o: any) => ({
          id: o.id, name: o.name,
        }));
        results.meta = orbs.meta;
        break;
      }
      default:
        results.error = `Unknown endpoint: ${endpoint}. Try: events, player-events, team-order, upgrade-data, inventory, squads, raids, episodics, towers, dds, wishlist, orbs`;
    }
  } catch (err) {
    results.error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(results);
}
