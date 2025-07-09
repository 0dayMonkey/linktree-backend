const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// --- En-têtes CORS pour autoriser votre frontend ---
const headers = {
  'Access-Control-Allow-Origin': 'https://harib-naim.fr',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Fonctions utilitaires
const deletePage = (pageId) => notion.pages.update({ page_id: pageId, archived: true });

const updateProfilePage = (pageId, data) => {
    const { profile, appearance } = data;
    return notion.pages.update({
        page_id: pageId,
        properties: {
            'profile_title': { rich_text: [{ text: { content: profile.title || "" } }] },
            'picture_url': { url: profile.pictureUrl || null },
            'font_family': { rich_text: [{ text: { content: appearance.fontFamily || "" } }] },
            'text_color': { rich_text: [{ text: { content: appearance.textColor || "" } }] },
            'background_type': { select: { name: appearance.background.type || "solid" } },
            'background_value': { rich_text: [{ text: { content: appearance.background.value.toString() } }] },
            'button_bg_color': { rich_text: [{ text: { content: appearance.button.backgroundColor || "" } }] },
            'button_text_color': { rich_text: [{ text: { content: appearance.button.textColor || "" } }] },
        }
    });
};

const createPage = (dbId, item, isSocial = false) => {
    let properties = {
        'id': { number: item.id },
        'Order': { number: item.order || 0 }
    };

    if (isSocial) {
        properties.Network = { title: [{ text: { content: item.network || "website" } }] };
        properties.URL = { url: item.url || null };
    } else {
        properties.Title = { title: [{ text: { content: item.title || "" } }] };
        properties.Type = { select: { name: item.type || "link" } };
        properties.URL = { url: item.url || null };
        properties['Thumbnail URL'] = { url: item.thumbnailUrl || null };
    }

    return notion.pages.create({ parent: { database_id: dbId }, properties });
};

exports.handler = async function (event, context) {
  // Gère la requête "preflight" OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  // Vérifie que c'est bien une requête POST
  if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
      const { secret, data } = JSON.parse(event.body);
      if (secret !== process.env.UPDATE_SECRET_KEY) {
          return { statusCode: 401, headers, body: 'Unauthorized' };
      }

      const linksDbId = process.env.NOTION_LINKS_DB_ID;
      const socialsDbId = process.env.NOTION_SOCIALS_DB_ID;

      // Mettre à jour le profil
      if (data.profilePageId) {
          await updateProfilePage(data.profilePageId, data);
      }

      // Sync des liens et icônes
      const [existingLinks, existingSocials] = await Promise.all([
          notion.databases.query({ database_id: linksDbId }),
          notion.databases.query({ database_id: socialsDbId })
      ]);

      const deletions = [
          ...existingLinks.results.map(p => deletePage(p.id)),
          ...existingSocials.results.map(p => deletePage(p.id))
      ];
      await Promise.all(deletions);

      const creations = [
          ...data.links.map((link, index) => createPage(linksDbId, { ...link, order: index })),
          ...data.socials.map((social, index) => createPage(socialsDbId, { ...social, order: index }, true))
      ];
      await Promise.all(creations);

      return {
          statusCode: 200,
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ message: 'Update successful' })
      };

  } catch (error) {
      console.error("Update Error:", error);
      return {
          statusCode: 500,
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ error: error.message })
      };
  }
};