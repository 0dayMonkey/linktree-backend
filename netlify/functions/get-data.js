const { Client } = require("@notionhq/client");

// Initialiser le client Notion avec le token d'API
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

exports.handler = async function (event, context) {
  try {
    // 1. Récupérer les IDs des bases de données depuis les variables d'environnement
    const profileDbId = process.env.NOTION_PROFILE_DB_ID;
    const socialsDbId = process.env.NOTION_SOCIALS_DB_ID;
    const linksDbId = process.env.NOTION_LINKS_DB_ID;

    // 2. Exécuter les requêtes vers Notion en parallèle
    const [profileResponse, socialsResponse, linksResponse] = await Promise.all([
      notion.databases.query({ database_id: profileDbId }),
      notion.databases.query({ database_id: socialsDbId }),
      notion.databases.query({ database_id: linksDbId }),
    ]);

    // 3. Formater les données de "Profile & Appearance"
    const profileData = profileResponse.results[0]?.properties || {};
    const formattedProfile = {
      profile: {
        title: profileData.profile_title?.rich_text[0]?.plain_text || "",
        pictureUrl: profileData.picture_url?.url || "",
      },
      appearance: {
        textColor: profileData.text_color?.rich_text[0]?.plain_text || "#000000",
        background: {
          type: profileData.background_type?.select?.name || "solid",
          value: profileData.background_value?.rich_text[0]?.plain_text || "#FFFFFF",
        },
        button: {
          backgroundColor: profileData.button_bg_color?.rich_text[0]?.plain_text || "#FFFFFF",
          textColor: profileData.button_text_color?.rich_text[0]?.plain_text || "#000000",
          // Ces valeurs sont fixes pour l'instant, comme dans votre code original
          borderRadius: '8px', 
          hasShadow: true
        }
      }
    };
    
    // 4. Formater les données "Socials"
    const formattedSocials = socialsResponse.results
      .map(item => ({
        network: item.properties.Network?.title[0]?.plain_text.toLowerCase() || 'website',
        url: item.properties.URL?.url || '',
        order: item.properties.Order?.number || 0
      }))
      .sort((a, b) => a.order - b.order);


    // 5. Formater les données "Links"
    const formattedLinks = linksResponse.results
      .map((item, index) => ({
        id: index, // L'ID peut simplement être l'index pour la compatibilité
        type: item.properties.Type?.select?.name || 'link',
        title: item.properties.Title?.title[0]?.plain_text || '',
        url: item.properties.URL?.url || '',
        thumbnailUrl: item.properties['Thumbnail URL']?.url || '',
        order: item.properties.Order?.number || 0
      }))
      .sort((a, b) => a.order - b.order);

    // 6. Combiner toutes les données dans un seul objet
    const finalData = {
      ...formattedProfile,
      socials: formattedSocials,
      links: formattedLinks,
      // Les données SEO peuvent être ajoutées de la même manière si besoin
      seo: { title: "Mon Linktree", description: "", faviconUrl: "" }
    };

    // 7. Renvoyer la réponse avec succès
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Autorise les requêtes depuis n'importe quelle origine
      },
      body: JSON.stringify(finalData),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch data from Notion." }),
    };
  }
};