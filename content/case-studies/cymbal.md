---
id: cymbal
name: Cymbal Retail
pdf: https://services.google.com/fh/files/misc/v6.1_pca_cymbal_retail_case_study_english.pdf
---

## Company Overview

Cymbal is an online retailer experiencing significant growth. The retailer specializes in a large assortment of products spanning several retail sub-verticals, which makes managing their extensive product catalog a constant challenge.

## Solution Concept

Cymbal wants to modernize its operations and enhance the customer experience in three core areas:

- **Catalog and Content Enrichment**: Cymbal wants to automate and improve the accuracy of their product catalog by utilizing gen AI to generate product attributes, descriptions, and images from supplier-provided information. This solution will streamline their catalog management, reduce manual effort and errors, and ensure information is consistent across all their sales channels.
- **Conversational Commerce with Product Discovery**: To enhance customer engagement and drive sales conversion, Cymbal wants to implement a Conversational Commerce solution. This solution will involve integrating AI-powered virtual agents into their website and mobile app to provide customers with a personalized and intuitive shopping experience through natural language conversations. These agents will utilize Google Cloud's Discovery AI to process user requests and retrieve the most relevant products based on each customer's needs and preferences, creating a more engaging and satisfying shopping journey.
- **Technical Stack Modernization**: To streamline operations and reduce costs around manual processes, data transfer, error handling and remediation, Cymbal wants to modernize their technical stack with cloud-based infrastructure, secure and efficient data handling, 3rd party integrations, and proactive monitoring and security.

## Existing Technical Environment

Cymbal currently relies on the following environment:

- A mix of on-premises and cloud-based systems.
- A variety of databases, including MySQL, Microsoft SQL Server, Redis, and MongoDB, to store and manage its vast product catalog and customer data.
- Kubernetes clusters to run containerized applications.
- Legacy file-based integrations with on-premises systems, including SFTP file transfers, ETL batch processing.
- A custom-built web application which allows customers to browse the product catalog by querying the relational databases for names and categories of products.
- An IVR (Interactive Voice Response) system to handle initial customer calls and route them to the appropriate departments or agents.
- Call center agents who receive transferred calls from the IVR system and manually enter orders into the system when a customer can’t complete a transaction on their own.
- Various open source tools for monitoring such as Grafana, Nagios, and Elastic.

The current technical environment has encountered significant challenges: manual processes are time-consuming and error-prone, data silos limit a unified view of the customer journey, and integrating new technologies is difficult.

## Business Requirements

Cymbal has outlined these key business requirements for the gen AI solution:

- **Automate Product Catalog Enrichment**: Reduce manual effort, minimize errors, and ensure accuracy and consistency across the product catalog.
- **Improve Product Discoverability**: Enhance search relevance and enable customers to find products more efficiently.
- **Increase Customer Engagement**: Create a more interactive and personalized shopping experience to improve customer satisfaction and potentially reduce product returns.
- **Drive Sales Conversion**: Provide a more intuitive and helpful shopping experience to improve sales conversion rates and drive revenue growth.
- **Reduce costs**: Reduce call center staffing costs and data-center hosting costs.

## Technical Requirements

- **Attribute Generation**: Accurately derive relevant product attributes from various supplier data, including titles, descriptions, and images, ensuring the attributes align with the product category and Cymbal's existing catalog structure.
- **Image Generation and Enhancement**: Generate different product image variations from a base image (e.g., showcasing various colors). It should also support background changes, product color adjustments, and the addition of text overlays.
- **Automate Product Discovery:** Process customer requests expressed in natural language and return highly relevant product results.
- **Scalability and Performance**: The solution must handle Cymbal's extensive product catalog and accommodate their anticipated growth without compromising performance or user experience.
- **Human-in-the-Loop (HITL) Review**: Provide a user interface (UI) for associates to review and manage gen AI-generated content, allowing them to approve, reject, or modify suggestions before updating the product catalog.
- **Data Security and Compliance**: Ensure all customer data, including product information and interactions with virtual agents, are handled securely and comply with relevant industry regulations.

## Executive Statement

By implementing Google Cloud's Generative AI for Digital Commerce solutions, Cymbal can transform its online retail operations to improve efficiency, enhance customer experience, and drive revenue growth. Key benefits for Cymbal include:

- **Reduced operational costs** through automation of catalog management tasks.
- **Increased efficiency and speed** in onboarding new products and updating existing ones.
- **Improved accuracy and consistency** of product information across all sales channels.
- **A more engaging and personalized shopping experience** that caters to modern customer preferences for conversational commerce.
- **Enhanced product discoverability** leading to higher conversion rates and increased sales.

This strategic investment in generative AI will position Cymbal to remain competitive and thrive in the rapidly evolving landscape of online retail.
